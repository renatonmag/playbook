import { createEffect, createMemo, For, onCleanup } from "solid-js";
import { produce, reconcile, unwrap } from "solid-js/store";
import deepEqual from "deep-equal";
import { createStore } from "solid-js/store";
import { useParams } from "@solidjs/router";
import { useMutation, useQuery } from "@tanstack/solid-query";
import { orpc } from "~/lib/orpc";
import type { StrategyAnswer, StrategyQuestion } from "~/db/schema";
import { Button } from "~/components/ui/button";

// Navigate into the nested structure to get the question at `path`
function getQuestion(
  draft: StrategyQuestion[],
  path: number[],
): StrategyQuestion {
  let q = draft[path[0]];
  for (let i = 1; i < path.length; i++) q = q.subQuestions![path[i]];
  return q;
}

// Returns the array that directly contains the question at `path`
function parentArr(
  draft: StrategyQuestion[],
  path: number[],
): StrategyQuestion[] {
  let arr: StrategyQuestion[] = draft;
  for (let i = 0; i < path.length - 1; i++) arr = arr[path[i]].subQuestions!;
  return arr;
}

const MAX_DEPTH = 5;

type Handlers = {
  removeQuestion: (path: number[]) => void;
  editQuestion: (path: number[], value: string) => void;
  addSubQuestion: (path: number[]) => void;
  addAnswer: (path: number[]) => void;
  removeAnswer: (path: number[], ai: number) => void;
  editAnswer: (path: number[], ai: number, value: string) => void;
};

function QuestionCard(props: {
  q: StrategyQuestion;
  path: number[];
  depth: number;
  handlers: Handlers;
}) {
  const { handlers } = props;
  return (
    <div
      class={
        props.depth > 1
          ? "border-l-2 border-gray-200 pl-3 ml-2 flex flex-col gap-3"
          : "border border-gray-200 rounded-lg p-4 flex flex-col gap-3"
      }
    >
      {/* Question row */}
      <div class="flex gap-2 items-start">
        <input
          class="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm "
          placeholder="Question…"
          value={props.q.question}
          onInput={(e) =>
            handlers.editQuestion(props.path, e.currentTarget.value)
          }
        />
        <button
          class="text-gray-400 hover:text-red-500 text-sm px-2 py-1"
          onClick={() => handlers.removeQuestion(props.path)}
        >
          ✕
        </button>
      </div>

      {/* Answers */}
      <div class="flex flex-col gap-2 pl-3">
        <For each={props.q.answers}>
          {(a: StrategyAnswer, ai) => (
            <div class="flex gap-2 items-center">
              <input
                class="flex-1 border border-gray-200 rounded px-3 py-1 text-sm"
                placeholder="Answer…"
                value={a.answer}
                onInput={(e) =>
                  handlers.editAnswer(props.path, ai(), e.currentTarget.value)
                }
              />
              <button
                class="text-gray-400 hover:text-red-400 text-xs px-1"
                onClick={() => handlers.removeAnswer(props.path, ai())}
              >
                ✕
              </button>
            </div>
          )}
        </For>
        <div class="flex gap-3">
          <button
            class="self-start text-xs text-gray-500 hover:text-gray-700"
            onClick={() => handlers.addAnswer(props.path)}
          >
            + Add answer
          </button>
          {props.depth < MAX_DEPTH && (
            <button
              class="self-start text-xs text-gray-500 hover:text-gray-700"
              onClick={() => handlers.addSubQuestion(props.path)}
            >
              + Add sub-question
            </button>
          )}
        </div>
      </div>

      {/* Sub-questions */}
      <For each={props.q.subQuestions ?? []}>
        {(sq: StrategyQuestion, si) => (
          <QuestionCard
            q={sq}
            path={[...props.path, si()]}
            depth={props.depth + 1}
            handlers={handlers}
          />
        )}
      </For>
    </div>
  );
}

export default function StrategyPage() {
  const params = useParams();
  const id = createMemo(() => Number(params.id));

  const strategy = useQuery(() =>
    orpc.strategy.getById.queryOptions({ input: { id: id() } }),
  );

  const updateMutation = useMutation(() =>
    orpc.strategy.update.mutationOptions(),
  );

  const [questions, setQuestions] = createStore<StrategyQuestion[]>([]);
  const [questionsHistory, setQuestionsHistory] = createStore<
    StrategyQuestion[]
  >([]);

  createEffect(() => {
    const qs = strategy.data?.questions ?? [];
    setQuestions(reconcile(qs));
    setQuestionsHistory(reconcile(qs));
  });

  createEffect(() => {
    JSON.stringify(questions);
    if (deepEqual(questions, questionsHistory)) return;

    const timer = setTimeout(async () => {
      await updateMutation.mutateAsync({
        id: id(),
        questions: unwrap(questions),
      });
      setQuestionsHistory(structuredClone(unwrap(questions)));
    }, 2000);
    onCleanup(() => clearTimeout(timer));
  });

  const addQuestion = () => {
    setQuestions((s) => [
      ...s,
      {
        id: crypto.randomUUID(),
        question: "",
        answers: [{ answer: "" }],
        subQuestions: [],
      },
    ]);
  };

  const handlers: Handlers = {
    removeQuestion: (path) => {
      setQuestions(
        produce((draft) => {
          const arr = parentArr(draft, path);
          arr.splice(path.at(-1)!, 1);
        }),
      );
    },

    editQuestion: (path, value) => {
      setQuestions(
        produce((draft) => {
          getQuestion(draft, path).question = value;
        }),
      );
    },

    addSubQuestion: (path) => {
      setQuestions(
        produce((draft) => {
          const q = getQuestion(draft, path);
          q.subQuestions ??= [];
          q.subQuestions.push({
            id: crypto.randomUUID(),
            question: "",
            answers: [{ answer: "" }],
            subQuestions: [],
          });
        }),
      );
    },

    addAnswer: (path) => {
      setQuestions(
        produce((draft) => {
          getQuestion(draft, path).answers.push({ answer: "" });
        }),
      );
    },

    removeAnswer: (path, ai) => {
      setQuestions(
        produce((draft) => {
          getQuestion(draft, path).answers.splice(ai, 1);
        }),
      );
    },

    editAnswer: (path, ai, value) => {
      setQuestions(
        produce((draft) => {
          getQuestion(draft, path).answers[ai].answer = value;
        }),
      );
    },
  };

  return (
    <main class="max-w-2xl mx-auto p-6 flex flex-col gap-6">
      <h1 class="text-xl font-semibold text-gray-800">
        {strategy.data?.name ?? "Strategy"}
      </h1>

      <div class="flex flex-col gap-4">
        <h2 class="text-sm font-medium text-gray-600 uppercase tracking-wide">
          Questions
        </h2>

        <For each={questions}>
          {(q, i) => (
            <QuestionCard q={q} path={[i()]} depth={1} handlers={handlers} />
          )}
        </For>

        <Button class="self-start" variant={"outline"} onClick={addQuestion}>
          + Add question
        </Button>
      </div>
    </main>
  );
}
