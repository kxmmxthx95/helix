import { useEffect, useRef, useState } from "react";
import { ChevronForward } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { Button, Input, Spinner } from "@/components/ui";
import { useChatExamQuestion, type AiChatMessage, type GeneratedQuestion } from "@/hooks/useExamBank";
import { cn } from "@/lib/utils";

const GREETING = "อยากออกข้อสอบเรื่องอะไร ประเภทคำถามไหน ระดับความยากแค่ไหน บอกมาได้เลยครับ";

/** Side drawer (same Sheet as QuestionSheet) — chat with the AI (Groq) to draft one exam question. Each finished draft is handed to onGenerated to fill the caller's form; teacher still reviews/edits and saves normally. History resets every time the drawer opens. */
export function AiQuestionDrawer({
  open,
  onOpenChange,
  onGenerated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated: (question: GeneratedQuestion) => void;
}) {
  const [history, setHistory] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState("");
  const chat = useChatExamQuestion();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setHistory([]);
      setInput("");
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, chat.isPending]);

  function send() {
    const text = input.trim();
    if (!text || chat.isPending) return;
    const next = [...history, { role: "user" as const, content: text }];
    setHistory(next);
    setInput("");
    chat.mutate(next, {
      onSuccess: (turn) => {
        setHistory((h) => [...h, { role: "assistant", content: turn.reply }]);
        if (turn.done && turn.question) onGenerated(turn.question);
      },
      onError: () => setHistory((h) => [...h, { role: "assistant", content: "ขอโทษครับ ตอบไม่ได้ ลองใหม่อีกครั้ง" }]),
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="สร้างข้อสอบด้วย AI"
      bodyClassName="flex flex-col gap-2"
      footer={
        <div className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
            placeholder="พิมพ์ข้อความ..."
            disabled={chat.isPending}
            className="min-w-0 flex-1"
          />
          <Button size="icon" aria-label="ส่ง" onClick={send} disabled={!input.trim() || chat.isPending}>
            <ChevronForward className="h-3.5 w-3.5" />
          </Button>
        </div>
      }
    >
      <ChatBubble role="assistant" text={GREETING} />
      {history.map((m, i) => (
        <ChatBubble key={i} role={m.role} text={m.content} />
      ))}
      {chat.isPending && (
        <div className="flex justify-start">
          <Spinner className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}
      <div ref={bottomRef} />
    </Sheet>
  );
}

function ChatBubble({ role, text }: { role: "user" | "assistant"; text: string }) {
  return (
    <div className={cn("flex", role === "user" ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs",
          role === "user" ? "bg-accent text-accent-foreground" : "bg-muted",
        )}
      >
        {text}
      </div>
    </div>
  );
}
