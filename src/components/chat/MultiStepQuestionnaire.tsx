import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Send, ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

interface QuestionStep {
  number: number;
  question: string;
  options: string[];
}

interface MultiStepQuestionnaireProps {
  preamble?: string;
  questions: QuestionStep[];
  onComplete: (combinedAnswer: string) => void;
  disabled?: boolean;
  selectedValue?: string | null;
}

/**
 * Parse multi-question patterns from AI content.
 */
export function parseMultiStepQuestions(content: string): { preamble: string; questions: QuestionStep[] } | null {
  const lines = content.split("\n");
  const questions: QuestionStep[] = [];
  let preamble = "";
  let questionStartIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const qMatch = line.match(/^(\d+)\.\s+(?:\*\*(.+?)\*\*|(.+))\s*$/);
    if (qMatch) {
      const num = parseInt(qMatch[1]);
      const questionText = (qMatch[2] || qMatch[3] || "").trim();
      const isQuestion = questionText.endsWith("?") || 
        /\b(what|which|how|where|when|who|specify|describe|provide)\b/i.test(questionText);
      
      if (isQuestion) {
        if (questionStartIdx === -1) questionStartIdx = i;
        
        const options: string[] = [];
        for (let j = i + 1; j < lines.length; j++) {
          const subLine = lines[j].trim();
          const optMatch = subLine.match(/^(?:[a-z]\)|[-•])\s*(.+)$/);
          if (optMatch) {
            options.push(optMatch[1].trim());
          } else if (subLine === "") {
            continue;
          } else {
            break;
          }
        }
        
        questions.push({ number: num, question: questionText, options });
      }
    }
  }

  if (questions.length < 2) return null;

  if (questionStartIdx > 0) {
    preamble = lines.slice(0, questionStartIdx).join("\n").trim();
  }

  return { preamble, questions };
}

export function MultiStepQuestionnaire({ preamble, questions, onComplete, disabled, selectedValue }: MultiStepQuestionnaireProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>(new Array(questions.length).fill(""));
  const [customInput, setCustomInput] = useState("");
  const [completed, setCompleted] = useState(false);

  // If there's a selectedValue, this questionnaire was already answered
  const alreadyAnswered = !!selectedValue;

  // If already answered, show a completed state
  useEffect(() => {
    if (alreadyAnswered) {
      setCompleted(true);
    }
  }, [alreadyAnswered]);

  const current = questions[currentStep];
  const progress = completed ? 100 : ((currentStep) / questions.length) * 100;
  const isLast = currentStep === questions.length - 1;

  const selectOption = (option: string) => {
    if (disabled || completed) return;
    const newAnswers = [...answers];
    newAnswers[currentStep] = option;
    setAnswers(newAnswers);
    setCustomInput("");

    if (isLast) {
      setCompleted(true);
      const combined = questions.map((q, i) => `${q.question}\n→ ${newAnswers[i]}`).join("\n\n");
      onComplete(combined);
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const submitCustom = () => {
    if (!customInput.trim()) return;
    selectOption(customInput.trim());
    setCustomInput("");
  };

  // Completed state (already answered or just finished)
  if (completed) {
    return (
      <div className="space-y-3">
        {preamble && (
          <p className="text-sm text-foreground/90 leading-relaxed">{preamble}</p>
        )}
        <div className="flex items-center gap-3">
          <Progress value={100} className="h-1.5 flex-1" />
          <span className="text-[10px] text-muted-foreground font-medium whitespace-nowrap flex items-center gap-1">
            <Check className="h-3 w-3 text-primary" />
            Completed
          </span>
        </div>
        {/* Show answered questions */}
        <div className="space-y-1">
          {questions.map((q, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Check className="h-3 w-3 text-primary shrink-0" />
              <span className="truncate">{q.question}</span>
              {answers[i] && <span className="text-foreground/70">→ {answers[i]}</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {preamble && (
        <p className="text-sm text-foreground/90 leading-relaxed">{preamble}</p>
      )}

      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <Progress value={progress} className="h-1.5 flex-1" />
        <span className="text-[10px] text-muted-foreground font-medium whitespace-nowrap">
          {currentStep + 1} of {questions.length}
        </span>
      </div>

      {/* Current question */}
      <div className="space-y-2.5">
        <p className="text-sm font-medium text-foreground flex items-start gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold mt-0.5">
            {current.number}
          </span>
          {current.question}
        </p>

        {/* Options */}
        {current.options.length > 0 && (
          <div className="grid gap-1.5 pl-7">
            {current.options.map((opt, i) => (
              <Card
                key={i}
                className="group cursor-pointer border-border/60 hover:border-primary/40 hover:bg-accent/30 transition-all duration-200 p-0"
                onClick={() => !disabled && selectOption(opt)}
              >
                <div className="flex items-center gap-2.5 px-3 py-2">
                  <ChevronRight className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="text-xs text-foreground">{opt}</span>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Custom input */}
        <div className="flex items-center gap-2 pl-7">
          <Input
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder={current.options.length > 0 ? "Or type your answer..." : "Type your answer..."}
            className="h-8 text-xs"
            disabled={disabled}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitCustom();
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            disabled={disabled || !customInput.trim()}
            onClick={submitCustom}
          >
            {isLast ? <Check className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Previous answers summary */}
      {currentStep > 0 && (
        <div className="pl-7 pt-1 space-y-1">
          {questions.slice(0, currentStep).map((q, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Check className="h-3 w-3 text-primary" />
              <span className="truncate">{q.question}</span>
              <span className="text-foreground/70">→ {answers[i]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
