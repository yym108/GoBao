package main

import (
	"bytes"
	"encoding/json"
)

type dedupFilter struct {
	lastCommentaryByTurn map[string]string
	itemMetaByID         map[string]agentMessageMeta
	pendingFinalByID     map[string]*pendingFinal
}

type agentMessageMeta struct {
	ThreadID string
	TurnID   string
	Phase    string
}

type pendingFinal struct {
	startedMsg      []byte
	commentaryText  string
	bufferedDeltas  [][]byte
	bufferedText    string
	enteredRealtime bool
}

type notificationEnvelope struct {
	Method string          `json:"method"`
	Params json.RawMessage `json:"params"`
}

type itemLifecycleParams struct {
	ThreadID string          `json:"threadId"`
	TurnID   string          `json:"turnId"`
	Item     agentMessageItem `json:"item"`
}

type agentMessageDeltaParams struct {
	ThreadID string `json:"threadId"`
	TurnID   string `json:"turnId"`
	ItemID   string `json:"itemId"`
	Delta    string `json:"delta"`
}

type agentMessageItem struct {
	ID    string `json:"id"`
	Type  string `json:"type"`
	Phase string `json:"phase"`
	Text  string `json:"text"`
}

func newDedupFilter() *dedupFilter {
	return &dedupFilter{
		lastCommentaryByTurn: make(map[string]string),
		itemMetaByID:         make(map[string]agentMessageMeta),
		pendingFinalByID:     make(map[string]*pendingFinal),
	}
}

func (f *dedupFilter) filterServerMessage(msg []byte) ([][]byte, error) {
	var env notificationEnvelope
	if err := json.Unmarshal(msg, &env); err != nil {
		return [][]byte{msg}, nil
	}

	switch env.Method {
	case "item/started":
		return f.handleItemStarted(msg, env.Params)
	case "item/agentMessage/delta":
		return f.handleAgentMessageDelta(msg, env.Params)
	case "item/completed":
		return f.handleItemCompleted(msg, env.Params)
	default:
		return [][]byte{msg}, nil
	}
}

func (f *dedupFilter) handleItemStarted(msg []byte, raw json.RawMessage) ([][]byte, error) {
	var params itemLifecycleParams
	if err := json.Unmarshal(raw, &params); err != nil {
		return [][]byte{msg}, nil
	}
	if params.Item.Type != "agentMessage" {
		return [][]byte{msg}, nil
	}

	f.itemMetaByID[params.Item.ID] = agentMessageMeta{
		ThreadID: params.ThreadID,
		TurnID:   params.TurnID,
		Phase:    params.Item.Phase,
	}

	if params.Item.Phase != "final_answer" {
		return [][]byte{msg}, nil
	}

	commentaryText, ok := f.lastCommentaryByTurn[params.TurnID]
	if !ok {
		return [][]byte{msg}, nil
	}

	f.pendingFinalByID[params.Item.ID] = &pendingFinal{
		startedMsg:     cloneBytes(msg),
		commentaryText: commentaryText,
	}
	return nil, nil
}

func (f *dedupFilter) handleAgentMessageDelta(msg []byte, raw json.RawMessage) ([][]byte, error) {
	var params agentMessageDeltaParams
	if err := json.Unmarshal(raw, &params); err != nil {
		return [][]byte{msg}, nil
	}

	pending, ok := f.pendingFinalByID[params.ItemID]
	if !ok {
		return [][]byte{msg}, nil
	}

	if pending.enteredRealtime {
		return [][]byte{msg}, nil
	}

	pending.bufferedDeltas = append(pending.bufferedDeltas, cloneBytes(msg))
	pending.bufferedText += params.Delta

	if !bytes.HasPrefix([]byte(pending.commentaryText), []byte(pending.bufferedText)) {
		pending.enteredRealtime = true
		out := make([][]byte, 0, 1+len(pending.bufferedDeltas))
		out = append(out, pending.startedMsg)
		out = append(out, pending.bufferedDeltas...)
		pending.startedMsg = nil
		pending.bufferedDeltas = nil
		return out, nil
	}

	return nil, nil
}

func (f *dedupFilter) handleItemCompleted(msg []byte, raw json.RawMessage) ([][]byte, error) {
	var params itemLifecycleParams
	if err := json.Unmarshal(raw, &params); err != nil {
		return [][]byte{msg}, nil
	}
	if params.Item.Type != "agentMessage" {
		return [][]byte{msg}, nil
	}

	if params.Item.Phase == "commentary" {
		f.lastCommentaryByTurn[params.TurnID] = params.Item.Text
		return [][]byte{msg}, nil
	}

	if params.Item.Phase != "final_answer" {
		return [][]byte{msg}, nil
	}

	pending, ok := f.pendingFinalByID[params.Item.ID]
	if !ok {
		return [][]byte{msg}, nil
	}
	delete(f.pendingFinalByID, params.Item.ID)

	if params.Item.Text == pending.commentaryText {
		return nil, nil
	}

	if pending.enteredRealtime {
		return [][]byte{msg}, nil
	}

	out := make([][]byte, 0, 2+len(pending.bufferedDeltas))
	out = append(out, pending.startedMsg)
	out = append(out, pending.bufferedDeltas...)
	out = append(out, cloneBytes(msg))
	return out, nil
}

func cloneBytes(in []byte) []byte {
	out := make([]byte, len(in))
	copy(out, in)
	return out
}
