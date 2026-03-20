import {
  createComputed,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
} from "solid-js";
import { produce, unwrap } from "solid-js/store";
import deepEqual from "deep-equal";
import { parseMarkdown } from "~/lib/parseMarkdown";
import { createStore, reconcile } from "solid-js/store";
import { checklist, getListComponent, setChecklist } from "~/store/checklist";
import { useSearchParams } from "@solidjs/router";
import { useStore } from "~/store/storeContext";
import { PatternPreview } from "~/components/pattern/PatternPreview";
import {
  PatternEdit,
  type QuestionType,
} from "~/components/pattern/PatternEdit";
import { useQuery } from "@tanstack/solid-query";
import { orpc } from "~/lib/orpc";

type PatternDraft = {
  title: string;
  categories: string;
  exemples: { uri: string; key: string }[];
  markdown: { content: string };
};

export default function Home() {
  const [editTitle, setEditTitle] = createSignal(false),
    [questions, setQuestions] = createStore<QuestionType[]>([]),
    [questionsHistory, setQuestionsHistory] = createStore<QuestionType[]>([]);

  const [params, _] = useSearchParams();
  const [store, actions] = useStore();

  const componentsList = useQuery(() =>
    orpc.component.listByUser.queryOptions({}),
  );

  const component = createMemo(() => {
    let id = Number(params.pattern);
    if (!id) id = -1;
    return componentsList?.data?.find((c) => c.id === id);
  });

  createEffect(() => {
    setQuestions(structuredClone(unwrap(component()?.questions) || []));
    setQuestionsHistory(structuredClone(unwrap(component()?.questions) || []));
  });

  const addQuestion = () => {
    setQuestions((state) => [
      ...state,
      {
        id: crypto.randomUUID(),
        question: "",
        questionFunction: "",
        answers: [{ answer: "", consequence: 0 }],
      },
    ]);
  };

  const removeQuestion = (index: number) => {
    if (index === 0) return;
    setQuestions((state) => {
      const next = [...state];
      next.splice(index, 1);
      return next;
    });
  };

  const editQuestionFunction = (index: number, value: string) => {
    setQuestions(
      produce((draft) => {
        draft[index].questionFunction = value;
        return draft;
      }),
    );
  };

  const addAnswer = (index: number) => {
    setQuestions(
      produce((draft) => {
        const q = draft[index];
        q.answers = [...q.answers, { answer: "", consequence: "" }];
        return draft;
      }),
    );
  };

  const removeAnswer = (index: number, answerIndex: number) => {
    setQuestions((state) => {
      const q = state[index];
      const answers = [
        ...q.answers.slice(0, answerIndex),
        ...q.answers.slice(answerIndex + 1),
      ];
      const updated = { ...q, answers };
      return [...state.slice(0, index), updated, ...state.slice(index + 1)];
    });
  };

  const editQuestion = (index: number, value: string) => {
    setQuestions(
      produce((draft) => {
        draft[index].question = value;
        return draft;
      }),
    );
  };

  const editAnswer = (index: number, answerIndex: number, value: string) => {
    setQuestions(
      produce((draft) => {
        draft[index].answers[answerIndex].answer = value;
        return draft;
      }),
    );
  };

  const editConsequence = (
    index: number,
    answerIndex: number,
    value: number,
  ) => {
    setQuestions(
      produce((draft) => {
        draft[index].answers[answerIndex].consequence = value;
        return draft;
      }),
    );
  };

  const [patternDraft, setPatternDraft] = createStore<Partial<PatternDraft>>(
    {},
  );

  createEffect(() => {
    JSON.stringify(questions);
    if (deepEqual(questions, questionsHistory)) return;

    const timer1 = setTimeout(async () => {
      await actions.updateComponent(component()?.id, { questions });
      setQuestionsHistory(structuredClone(unwrap(questions)));
    }, 2000);
    onCleanup(() => clearTimeout(timer1));
  });

  createEffect(() => {
    const dataToSave = {
      ...patternDraft,
      markdown: patternDraft?.markdown?.content,
    };

    if (deepEqual(patternDraft, {})) return;

    const timer2 = setTimeout(async () => {
      await actions.updateComponent(component()?.id, dataToSave);
      setPatternDraft({});
    }, 2000);

    onCleanup(() => clearTimeout(timer2));
  });

  const availableDetails = createMemo(
    () =>
      componentsList.data
        ?.filter((c) => c.strategyId === component()?.strategyId)
        .map((c) => ({ id: c.id, uuid: c.uuid, title: c.title })) ?? [],
  );

  const selectedDetails = createMemo(() => component()?.details ?? []);

  const [detailInput, setDetailInput] = createSignal("");

  const addDetail = async (uuid: string) => {
    const current = selectedDetails();
    if (current.includes(uuid)) return;
    await actions.updateComponent(component()?.id, {
      details: [...current, uuid],
    });
  };

  const removeDetail = async (uuid: string) => {
    await actions.updateComponent(component()?.id, {
      details: selectedDetails().filter((d) => d !== uuid),
    });
  };

  const createAndAddDetail = async () => {
    const title = detailInput().trim();
    if (!title) return;
    const newComp = await actions.createComponent.mutateAsync({
      title,
      strategyId: component()?.strategyId,
    });
    if (newComp?.uuid) await addDetail(newComp.uuid);
    setDetailInput("");
  };

  const [html] = createResource(
    () =>
      patternDraft.markdown?.content || component()?.markdown?.content || "",
    parseMarkdown,
  );

  const deleteImage = (key: string) => {
    const current = patternDraft.exemples ?? component()?.exemples ?? [];
    setPatternDraft(
      "exemples",
      current.filter((e) => e.key !== key),
    );
  };

  if (!params.pattern) {
    return <div>Lista ou Padrão não encontrado</div>;
  }

  return (
    <main class="flex w-full h-[calc(100vh-52px)] text-gray-800 p-2 gap-1">
      <div class="w-2/3 h-full py-4 px-4 flex flex-col items-center justify-start relative overflow-y-auto">
        <PatternPreview
          title={patternDraft.title || component()?.title || ""}
          images={patternDraft.exemples || component()?.exemples || []}
          html={html() || ""}
        />
      </div>
      <div class="w-[calc(33%+3rem)] h-full border border-gray-200 rounded-lg py-4 px-4 flex flex-col items-center justify-start overflow-y-auto">
        <PatternEdit
          title={patternDraft.title || component()?.title || ""}
          images={patternDraft.exemples || component()?.exemples || []}
          categories={patternDraft.categories || component()?.categories || ""}
          markdownContent={
            patternDraft.markdown?.content ||
            component()?.markdown?.content ||
            ""
          }
          questions={questions}
          components={
            store.components?.data?.map((c) => ({
              id: c.id,
              title: c.title,
            })) || []
          }
          patternId={Number(params.pattern)}
          details={selectedDetails()}
          availableDetails={availableDetails()}
          detailInput={detailInput()}
          editingTitle={editTitle()}
          onTitleMouseDown={() => setEditTitle(true)}
          onTitleInput={(v) => setPatternDraft("title", v)}
          onTitleBlur={() => setEditTitle(false)}
          onDeleteImage={deleteImage}
          onUploadComplete={(res) =>
            setPatternDraft("exemples", (s) => [
              ...(s ?? []),
              ...res.map((r) => ({ uri: r.ufsUrl, key: r.key })),
            ])
          }
          onCategoriesChange={(v) => setPatternDraft("categories", v)}
          onMarkdownInput={(v) =>
            setPatternDraft(
              produce((d) => {
                d.markdown = { content: v };
              }),
            )
          }
          onAddQuestion={addQuestion}
          onRemoveQuestion={removeQuestion}
          onEditQuestion={editQuestion}
          onEditQuestionFunction={editQuestionFunction}
          onAddAnswer={addAnswer}
          onRemoveAnswer={removeAnswer}
          onEditAnswer={editAnswer}
          onEditConsequence={editConsequence}
          onDetailSelect={addDetail}
          onDetailRemove={removeDetail}
          onDetailInputChange={setDetailInput}
          onCreateDetail={createAndAddDetail}
        />
      </div>
    </main>
  );
}
