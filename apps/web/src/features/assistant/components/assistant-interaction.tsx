import { ShieldCheckIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@heydesk/ui/components/button";
import { Input } from "@heydesk/ui/components/input";

import {
  Confirmation,
  ConfirmationAccept,
  ConfirmationAction,
  ConfirmationContent,
  ConfirmationDescription,
  ConfirmationHeader,
  ConfirmationIcon,
  ConfirmationReject,
  ConfirmationTitle,
} from "@/components/ai/confirmation";
import type { AssistantInteraction } from "../assistant.types";

type AssistantInteractionProps = {
  interaction: AssistantInteraction;
  onRespond: (response: {
    approved?: boolean;
    answers?: Record<string, string[]>;
  }) => void;
};

export function AssistantInteractionCard({
  interaction,
  onRespond,
}: AssistantInteractionProps) {
  const questions = interaction.questions ?? [];
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const hasAllAnswers = questions.every(
    (question) => answers[question.id]?.length,
  );
  return (
    <Confirmation
      tone={interaction.kind === "permissions" ? "danger" : "default"}
    >
      <ConfirmationHeader>
        <ConfirmationIcon>
          <ShieldCheckIcon />
        </ConfirmationIcon>
        <ConfirmationTitle>{interaction.title}</ConfirmationTitle>
      </ConfirmationHeader>
      {(interaction.description || questions.length > 0) && (
        <ConfirmationDescription>
          {interaction.description ?? "Answer each question to continue."}
        </ConfirmationDescription>
      )}
      {questions.length > 0 && (
        <ConfirmationContent className="space-y-4">
          {questions.map((question) => (
            <fieldset className="space-y-2" key={question.id}>
              <legend className="text-sm font-medium">
                {question.question}
              </legend>
              <div className="flex flex-wrap gap-2">
                {question.options?.map((option) => {
                  const selected = answers[question.id]?.includes(option.label);
                  return (
                    <Button
                      aria-pressed={selected}
                      key={option.label}
                      onClick={() =>
                        setAnswers((current) => ({
                          ...current,
                          [question.id]: [option.label],
                        }))
                      }
                      size="sm"
                      type="button"
                      variant={selected ? "default" : "outline"}
                    >
                      {option.label}
                    </Button>
                  );
                })}
                {!question.options?.length && (
                  <Input
                    onChange={(event) =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: event.target.value
                          ? [event.target.value]
                          : [],
                      }))
                    }
                    placeholder="Type your answer"
                    value={answers[question.id]?.[0] ?? ""}
                  />
                )}
              </div>
            </fieldset>
          ))}
        </ConfirmationContent>
      )}
      <ConfirmationAction>
        {questions.length > 0 ? (
          <ConfirmationAccept
            disabled={!hasAllAnswers}
            onClick={() => onRespond({ answers })}
            render={<Button size="sm" />}
          >
            Continue
          </ConfirmationAccept>
        ) : (
          <>
            <ConfirmationReject
              onClick={() => onRespond({ approved: false })}
              render={<Button size="sm" variant="ghost" />}
            >
              Decline
            </ConfirmationReject>
            <ConfirmationAccept
              onClick={() => onRespond({ approved: true })}
              render={<Button size="sm" />}
            >
              Allow once
            </ConfirmationAccept>
          </>
        )}
      </ConfirmationAction>
    </Confirmation>
  );
}
