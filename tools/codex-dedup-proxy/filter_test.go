package main

import (
	"encoding/json"
	"testing"
)

func TestFilter_DropsFinalAnswerWhenItExactlyMatchesLatestCommentary(t *testing.T) {
	commentaryStarted := mustJSON(t, notification{
		Method: "item/started",
		Params: mustRaw(t, map[string]any{
			"threadId": "thread-1",
			"turnId":   "turn-1",
			"item": map[string]any{
				"id":    "item-commentary",
				"type":  "agentMessage",
				"phase": "commentary",
				"text":  "",
			},
		}),
	})
	commentaryDelta := mustJSON(t, notification{
		Method: "item/agentMessage/delta",
		Params: mustRaw(t, map[string]any{
			"threadId": "thread-1",
			"turnId":   "turn-1",
			"itemId":   "item-commentary",
			"delta":    "same text",
		}),
	})
	commentaryCompleted := mustJSON(t, notification{
		Method: "item/completed",
		Params: mustRaw(t, map[string]any{
			"threadId": "thread-1",
			"turnId":   "turn-1",
			"item": map[string]any{
				"id":    "item-commentary",
				"type":  "agentMessage",
				"phase": "commentary",
				"text":  "same text",
			},
		}),
	})
	finalStarted := mustJSON(t, notification{
		Method: "item/started",
		Params: mustRaw(t, map[string]any{
			"threadId": "thread-1",
			"turnId":   "turn-1",
			"item": map[string]any{
				"id":    "item-final",
				"type":  "agentMessage",
				"phase": "final_answer",
				"text":  "",
			},
		}),
	})
	finalDelta := mustJSON(t, notification{
		Method: "item/agentMessage/delta",
		Params: mustRaw(t, map[string]any{
			"threadId": "thread-1",
			"turnId":   "turn-1",
			"itemId":   "item-final",
			"delta":    "same text",
		}),
	})
	finalCompleted := mustJSON(t, notification{
		Method: "item/completed",
		Params: mustRaw(t, map[string]any{
			"threadId": "thread-1",
			"turnId":   "turn-1",
			"item": map[string]any{
				"id":    "item-final",
				"type":  "agentMessage",
				"phase": "final_answer",
				"text":  "same text",
			},
		}),
	})

	f := newDedupFilter()
	forwarded := collectForwarded(t, f,
		commentaryStarted,
		commentaryDelta,
		commentaryCompleted,
		finalStarted,
		finalDelta,
		finalCompleted,
	)

	if len(forwarded) != 3 {
		t.Fatalf("expected only commentary notifications to be forwarded, got %d", len(forwarded))
	}
	assertForwardedMethods(t, forwarded, "item/started", "item/agentMessage/delta", "item/completed")
}

func TestFilter_ForwardsFinalAnswerWhenItDiffersFromLatestCommentary(t *testing.T) {
	commentaryCompleted := mustJSON(t, notification{
		Method: "item/completed",
		Params: mustRaw(t, map[string]any{
			"threadId": "thread-1",
			"turnId":   "turn-1",
			"item": map[string]any{
				"id":    "item-commentary",
				"type":  "agentMessage",
				"phase": "commentary",
				"text":  "same",
			},
		}),
	})
	finalStarted := mustJSON(t, notification{
		Method: "item/started",
		Params: mustRaw(t, map[string]any{
			"threadId": "thread-1",
			"turnId":   "turn-1",
			"item": map[string]any{
				"id":    "item-final",
				"type":  "agentMessage",
				"phase": "final_answer",
				"text":  "",
			},
		}),
	})
	finalDelta1 := mustJSON(t, notification{
		Method: "item/agentMessage/delta",
		Params: mustRaw(t, map[string]any{
			"threadId": "thread-1",
			"turnId":   "turn-1",
			"itemId":   "item-final",
			"delta":    "same but",
		}),
	})
	finalDelta2 := mustJSON(t, notification{
		Method: "item/agentMessage/delta",
		Params: mustRaw(t, map[string]any{
			"threadId": "thread-1",
			"turnId":   "turn-1",
			"itemId":   "item-final",
			"delta":    " different",
		}),
	})
	finalCompleted := mustJSON(t, notification{
		Method: "item/completed",
		Params: mustRaw(t, map[string]any{
			"threadId": "thread-1",
			"turnId":   "turn-1",
			"item": map[string]any{
				"id":    "item-final",
				"type":  "agentMessage",
				"phase": "final_answer",
				"text":  "same but different",
			},
		}),
	})

	f := newDedupFilter()
	forwarded := collectForwarded(t, f,
		commentaryCompleted,
		finalStarted,
		finalDelta1,
		finalDelta2,
		finalCompleted,
	)

	if len(forwarded) != 5 {
		t.Fatalf("expected commentary and full final answer stream to be forwarded, got %d", len(forwarded))
	}
	assertForwardedMethods(t, forwarded,
		"item/completed",
		"item/started",
		"item/agentMessage/delta",
		"item/agentMessage/delta",
		"item/completed",
	)
}

func TestFilter_OnlyComparesWithinSameTurn(t *testing.T) {
	prevTurnCommentary := mustJSON(t, notification{
		Method: "item/completed",
		Params: mustRaw(t, map[string]any{
			"threadId": "thread-1",
			"turnId":   "turn-1",
			"item": map[string]any{
				"id":    "item-commentary",
				"type":  "agentMessage",
				"phase": "commentary",
				"text":  "same text",
			},
		}),
	})
	nextTurnFinalStarted := mustJSON(t, notification{
		Method: "item/started",
		Params: mustRaw(t, map[string]any{
			"threadId": "thread-1",
			"turnId":   "turn-2",
			"item": map[string]any{
				"id":    "item-final",
				"type":  "agentMessage",
				"phase": "final_answer",
				"text":  "",
			},
		}),
	})
	nextTurnFinalDelta := mustJSON(t, notification{
		Method: "item/agentMessage/delta",
		Params: mustRaw(t, map[string]any{
			"threadId": "thread-1",
			"turnId":   "turn-2",
			"itemId":   "item-final",
			"delta":    "same text",
		}),
	})
	nextTurnFinalCompleted := mustJSON(t, notification{
		Method: "item/completed",
		Params: mustRaw(t, map[string]any{
			"threadId": "thread-1",
			"turnId":   "turn-2",
			"item": map[string]any{
				"id":    "item-final",
				"type":  "agentMessage",
				"phase": "final_answer",
				"text":  "same text",
			},
		}),
	})

	f := newDedupFilter()
	forwarded := collectForwarded(t, f,
		prevTurnCommentary,
		nextTurnFinalStarted,
		nextTurnFinalDelta,
		nextTurnFinalCompleted,
	)

	if len(forwarded) != 4 {
		t.Fatalf("expected cross-turn messages to remain untouched, got %d", len(forwarded))
	}
}

type notification struct {
	Method string          `json:"method"`
	Params json.RawMessage `json:"params"`
}

func collectForwarded(t *testing.T, f *dedupFilter, messages ...[]byte) [][]byte {
	t.Helper()
	var forwarded [][]byte
	for _, msg := range messages {
		out, err := f.filterServerMessage(msg)
		if err != nil {
			t.Fatalf("filterServerMessage() error = %v", err)
		}
		for _, one := range out {
			forwarded = append(forwarded, one)
		}
	}
	return forwarded
}

func assertForwardedMethods(t *testing.T, msgs [][]byte, want ...string) {
	t.Helper()
	if len(msgs) != len(want) {
		t.Fatalf("got %d methods, want %d", len(msgs), len(want))
	}
	for i, msg := range msgs {
		var got notification
		if err := json.Unmarshal(msg, &got); err != nil {
			t.Fatalf("json.Unmarshal() error = %v", err)
		}
		if got.Method != want[i] {
			t.Fatalf("method[%d] = %q, want %q", i, got.Method, want[i])
		}
	}
}

func mustJSON(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	return b
}

func mustRaw(t *testing.T, v any) json.RawMessage {
	t.Helper()
	return mustJSON(t, v)
}
