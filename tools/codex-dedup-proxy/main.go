package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "codex-dedup-proxy:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) == 0 {
		return errors.New("usage: codex-dedup-proxy run [codex args...]")
	}

	switch args[0] {
	case "run":
		return runCommand(args[1:])
	default:
		return fmt.Errorf("unknown subcommand %q", args[0])
	}
}

func runCommand(args []string) error {
	fs := flag.NewFlagSet("run", flag.ContinueOnError)
	fs.SetOutput(io.Discard)

	codexBin := fs.String("codex-bin", defaultCodexBin(), "path to the real codex executable")
	if err := fs.Parse(args); err != nil {
		return err
	}
	forwardArgs := fs.Args()
	if hasRemoteFlag(forwardArgs) {
		return errors.New("--remote is managed by codex-dedup-proxy; remove it from forwarded args")
	}

	ctx, stop := signalContext()
	defer stop()

	upstreamPort, err := reserveFreePort()
	if err != nil {
		return fmt.Errorf("reserve upstream port: %w", err)
	}
	proxyPort, err := reserveFreePort()
	if err != nil {
		return fmt.Errorf("reserve proxy port: %w", err)
	}

	logFile, err := os.CreateTemp("/tmp", "codex-app-server-*.log")
	if err != nil {
		return fmt.Errorf("create temp log: %w", err)
	}
	defer logFile.Close()

	upstreamURL := fmt.Sprintf("ws://127.0.0.1:%d", upstreamPort)
	appServerCmd := exec.CommandContext(ctx, *codexBin, "app-server", "--listen", upstreamURL)
	appServerCmd.Stdin = nil
	appServerCmd.Stdout = logFile
	appServerCmd.Stderr = logFile
	if err := appServerCmd.Start(); err != nil {
		return fmt.Errorf("start codex app-server: %w", err)
	}
	defer terminateProcess(appServerCmd)

	if err := waitForWebsocket(ctx, upstreamURL); err != nil {
		return fmt.Errorf("wait for app-server at %s: %w", upstreamURL, err)
	}

	proxy, err := newProxyServer(
		fmt.Sprintf("127.0.0.1:%d", proxyPort),
		upstreamURL,
	)
	if err != nil {
		return fmt.Errorf("create proxy: %w", err)
	}
	if err := proxy.start(); err != nil {
		return fmt.Errorf("start proxy: %w", err)
	}
	defer proxy.shutdown(context.Background())

	tuiArgs := append([]string{"--remote", fmt.Sprintf("ws://127.0.0.1:%d", proxyPort)}, forwardArgs...)
	tuiCmd := exec.CommandContext(ctx, *codexBin, tuiArgs...)
	tuiCmd.Stdin = os.Stdin
	tuiCmd.Stdout = os.Stdout
	tuiCmd.Stderr = os.Stderr
	if err := tuiCmd.Run(); err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			return &exitCodeError{code: exitErr.ExitCode()}
		}
		return fmt.Errorf("run codex tui: %w", err)
	}

	return nil
}

type proxyServer struct {
	addr       string
	upstream   string
	httpServer *http.Server
	upgrader   websocket.Upgrader
}

func newProxyServer(addr, upstream string) (*proxyServer, error) {
	p := &proxyServer{
		addr:     addr,
		upstream: upstream,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(*http.Request) bool { return true },
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", p.handleWS)
	p.httpServer = &http.Server{
		Addr:    addr,
		Handler: mux,
	}
	return p, nil
}

func (p *proxyServer) start() error {
	ln, err := net.Listen("tcp", p.addr)
	if err != nil {
		return err
	}
	go func() {
		_ = p.httpServer.Serve(ln)
	}()
	return waitForWebsocket(context.Background(), "ws://"+p.addr)
}

func (p *proxyServer) shutdown(ctx context.Context) error {
	return p.httpServer.Shutdown(ctx)
}

func (p *proxyServer) handleWS(w http.ResponseWriter, r *http.Request) {
	downstreamConn, err := p.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer downstreamConn.Close()

	upstreamConn, _, err := websocket.DefaultDialer.Dial(p.upstream, nil)
	if err != nil {
		_ = downstreamConn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "upstream unavailable"))
		return
	}
	defer upstreamConn.Close()

	filter := newDedupFilter()

	errCh := make(chan error, 2)
	go func() {
		errCh <- pipeWS(downstreamConn, upstreamConn, nil)
	}()
	go func() {
		errCh <- pipeWS(upstreamConn, downstreamConn, filter)
	}()

	<-errCh
}

func pipeWS(src, dst *websocket.Conn, filter *dedupFilter) error {
	for {
		messageType, payload, err := src.ReadMessage()
		if err != nil {
			return err
		}

		if messageType != websocket.TextMessage || filter == nil {
			if err := dst.WriteMessage(messageType, payload); err != nil {
				return err
			}
			continue
		}

		out, err := filter.filterServerMessage(payload)
		if err != nil {
			return err
		}
		for _, msg := range out {
			if err := dst.WriteMessage(websocket.TextMessage, msg); err != nil {
				return err
			}
		}
	}
}

func waitForWebsocket(parent context.Context, rawURL string) error {
	ctx, cancel := context.WithTimeout(parent, 10*time.Second)
	defer cancel()

	var lastErr error
	for {
		conn, _, err := websocket.DefaultDialer.DialContext(ctx, rawURL, nil)
		if err == nil {
			_ = conn.Close()
			return nil
		}
		lastErr = err

		select {
		case <-ctx.Done():
			return lastErr
		case <-time.After(100 * time.Millisecond):
		}
	}
}

func reserveFreePort() (int, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer ln.Close()
	return ln.Addr().(*net.TCPAddr).Port, nil
}

func hasRemoteFlag(args []string) bool {
	for i, arg := range args {
		if arg == "--remote" {
			return true
		}
		if strings.HasPrefix(arg, "--remote=") {
			return true
		}
		if arg == "-c" && i+1 < len(args) && strings.Contains(args[i+1], "remote") {
			return true
		}
	}
	return false
}

func signalContext() (context.Context, context.CancelFunc) {
	ctx, cancel := context.WithCancel(context.Background())
	sigCh := make(chan os.Signal, 1)
	signalNotify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		select {
		case <-sigCh:
			cancel()
		case <-ctx.Done():
		}
	}()
	return ctx, cancel
}

var signalNotify = func(c chan<- os.Signal, sig ...os.Signal) {
	signal.Notify(c, sig...)
}

type exitCodeError struct {
	code int
}

func (e *exitCodeError) Error() string {
	return fmt.Sprintf("codex exited with status %d", e.code)
}

func terminateProcess(cmd *exec.Cmd) {
	if cmd == nil || cmd.Process == nil {
		return
	}
	_ = cmd.Process.Signal(syscall.SIGTERM)

	done := make(chan struct{})
	go func() {
		_, _ = cmd.Process.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		_ = cmd.Process.Kill()
	}
}

func defaultCodexBin() string {
	exe, err := os.Executable()
	if err == nil {
		if resolved, err := filepath.EvalSymlinks(exe); err == nil {
			exe = resolved
		}
	}

	path, err := exec.LookPath("codex")
	if err == nil {
		if resolved, err := filepath.EvalSymlinks(path); err == nil {
			path = resolved
		}
		if exe == "" || path != exe {
			return path
		}
	}

	return "/opt/homebrew/bin/codex"
}
