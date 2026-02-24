import {
  createComputed,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Index,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js";
import { produce, unwrap } from "solid-js/store";
import deepEqual from "deep-equal";
import { parseMarkdown } from "~/lib/parseMarkdown";
import { Button } from "~/components/ui/button";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import { createStore, reconcile } from "solid-js/store";
import { checklist, getListComponent, setChecklist } from "~/store/checklist";
import { json, useParams, useSearchParams } from "@solidjs/router";
import { UploadButton } from "~/lib/uploadthing";
import { ImageCaroulsel } from "~/components/ImageCarousel";

import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import { useStore } from "~/store/storeContext";
import { Separator } from "~/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import SquareMinus from "lucide-solid/icons/square-minus";

type QuestionType = {
  id: string;
  question: string;
  questionFunction: string;
  answers: { answer: string; consequence: number }[];
};

export default function Home() {
  const [editTitle, setEditTitle] = createSignal(false),
    [questions, setQuestions] = createStore<QuestionType[]>([]),
    [questionsHistory, setQuestionsHistory] = createStore<QuestionType[]>([]);

  const [params, _] = useSearchParams();

  const [store, actions] = useStore();

  const component = createMemo(() => {
    let id = Number(params.pattern);
    if (!id) id = -1;

    return store.components?.data?.find((c) => c.id === id);
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
        console.log(value);
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

  type PatternDraft = {
    title: string;
    categories: string;
    exemples: { uri: string; key: string }[];
    markdown: { content: string };
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

    // Set a 2-second debounce timer
    const timer2 = setTimeout(async () => {
      await actions.updateComponent(component()?.id, dataToSave);
      setPatternDraft({});
      // Optional: revalidate() here if other parts of the UI need the update
    }, 2000);

    // If the user types again before 2s, this clears the previous timer2
    onCleanup(() => clearTimeout(timer2));
  });

  const [html] = createResource(
    () =>
      patternDraft.markdown?.content || component()?.markdown?.content || "",
    parseMarkdown,
  );
  let previewDiv: HTMLDivElement | undefined;

  createEffect(() => {
    if (previewDiv) {
      previewDiv.innerHTML = html() || "";
    }
  });

  const deleteImage = (key: string) => {
    setPatternDraft(
      "exemples",
      patternDraft.exemples.filter((e) => e.key !== key),
    );
  };

  if (!params.pattern) {
    return <div>Lista ou Padrão não encontrado</div>;
  }

  return (
    <main class="flex w-full h-[calc(100vh-52px)] text-gray-800 p-2 gap-1">
      <div class="w-2/3 h-full py-4 px-4 flex flex-col items-center justify-start relative overflow-y-auto">
        <Button
          as="a"
          href={"/lists"}
          variant="outline"
          size="icon"
          class="absolute top-4 left-4"
        >
          <ArrowLeft />
        </Button>

        <div class="font-bold text-xl text-gray-700 mb-4">
          {patternDraft.title || component()?.title}
        </div>
        <ImageCaroulsel
          class="max-w-2xl"
          images={patternDraft.exemples || component()?.exemples || []}
        />
        <div
          class="prose w-full h-full mt-[30px] wrap-break-word"
          ref={previewDiv}
        ></div>
      </div>

      <div class="w-[calc(33%+3rem)] h-full border-2 border-gray-200 rounded-lg py-4 px-4 flex flex-col items-center justify-start overflow-y-auto">
        <Switch>
          <Match when={editTitle()}>
            <TextField class="w-3/4">
              <TextFieldInput
                onBlur={() => setEditTitle(false)}
                value={patternDraft.title || component()?.title}
                class="text-xl font-bold text-gray-700 mb-4 w-full"
                type="text"
                id="text"
                onInput={(e) => {
                  setPatternDraft("title", e.currentTarget.value);
                }}
                placeholder="categorias separadas por virgula."
              />
            </TextField>
          </Match>
          <Match when={!editTitle()}>
            <div
              class="text-xl font-bold text-gray-700 mb-4"
              onMouseDown={() => setEditTitle(true)}
            >
              {patternDraft.title || component()?.title}
            </div>
          </Match>
        </Switch>
        <ImageCaroulsel
          class="max-w-lg"
          images={patternDraft.exemples || component()?.exemples || []}
          onDelete={deleteImage}
        />
        <UploadButton
          onClientUploadComplete={(res) => {
            // Do something with the response
            setPatternDraft("exemples", (state) => [
              ...state,
              ...res.map((r) => ({
                uri: r.ufsUrl,
                key: r.key,
              })),
            ]);
            // console.log(res);
            alert("Upload Completed");
          }}
          onUploadError={(error: Error) => {
            // Do something with the error.
            alert(`ERROR! ${error.message}`);
          }}
          content={{
            button({ ready, isUploading }) {
              if (!ready()) return "Preparando...";
              if (isUploading()) return "Enviando...";
              return "Escolher imagem"; // The default text whens ready
            },
          }}
          class="my-6 ut-button:px-3 ut-button:py-1 ut-button:text-gray-600 ut-button:bg-gray-200 ut-button:ut-readying:bg-gray-300/50"
          endpoint="imageUploader"
        />
        <TextField class="grid w-full items-center gap-1.5 mb-6">
          <TextFieldLabel class="col-span-1" for="email">
            Categoria
          </TextFieldLabel>
          <TextFieldInput
            value={patternDraft.categories || component()?.categories || ""}
            onChange={(e) => {
              setPatternDraft("categories", e.currentTarget.value);
            }}
            class="col-span-3"
            type="email"
            id="email"
            placeholder="impulse, pullback, trend, range, etc..."
          />
        </TextField>
        <Separator class=" mb-6" />
        <div class="h-full w-full">
          <textarea
            placeholder="Escreva seu texto aqui..."
            id="markdown"
            class="w-full min-h-full outline-none resize-none bg-transparent field-sizing-content"
            onInput={(e) => {
              setPatternDraft(
                produce((draft) => {
                  draft.markdown = { content: e.currentTarget.value || "" };
                  return draft;
                }),
              );
            }}
          >
            {patternDraft.markdown?.content ||
              component()?.markdown?.content ||
              ""}
          </textarea>
        </div>
        <Separator class="my-6" />
        <div class="w-full h-full">
          <div
            class="text-xl font-bold text-gray-700 mb-4"
            onMouseDown={() => setEditTitle(true)}
          >
            Perguntas
          </div>
          <For each={questions}>
            {(question, index) => (
              <div class="mb-6">
                <TextField class="flex flex-col w-full gap-1.5 mb-6">
                  <TextFieldLabel class="col-span-1" for="email">
                    Pergunta
                  </TextFieldLabel>
                  <TextFieldInput
                    value={
                      question.question ||
                      component()?.questions[index()]?.question ||
                      ""
                    }
                    onInput={(e) => {
                      editQuestion(index(), e.currentTarget.value);
                    }}
                    class="col-span-3"
                    type="text"
                    id="question"
                    placeholder="..."
                  />
                </TextField>
                <Select
                  value={question.questionFunction || ""}
                  onChange={(value) => editQuestionFunction(index(), value)}
                  class="mb-6"
                  options={["Especificação", "Detalhe", "Contexto"]}
                  placeholder="Função da pergunta."
                  itemComponent={(props) => (
                    <SelectItem item={props.item}>
                      {props.item.rawValue}
                    </SelectItem>
                  )}
                >
                  <SelectTrigger aria-label="Fruit" class="w-full">
                    <SelectValue<string>>
                      {(state) => state.selectedOption()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>
                <TextField class="flex flex-col w-full gap-1.5 mb-6">
                  <div class="grid grid-cols-2 gap-2">
                    <TextFieldLabel for="respostas">Respostas</TextFieldLabel>
                    <TextFieldLabel for="consequencias">
                      Consequências
                    </TextFieldLabel>
                  </div>
                  <For each={question.answers}>
                    {(answer, answerIndex) => (
                      <div class="grid grid-cols-2 gap-2">
                        <TextFieldInput
                          value={
                            answer.answer ||
                            component()?.questions[index()]?.answers[
                              answerIndex()
                            ]?.answer ||
                            ""
                          }
                          onInput={(e) =>
                            editAnswer(
                              index(),
                              answerIndex(),
                              e.currentTarget.value,
                            )
                          }
                          class="mb-2"
                          type="text"
                          id="questionAnswer"
                          placeholder="Sim, Não, etc..."
                        />
                        <div class="flex gap-2">
                          <Select
                            value={answer.consequence || ""}
                            onChange={(value) => {
                              console.log(value);
                              editConsequence(index(), answerIndex(), value);
                            }}
                            class="flex-1"
                            options={
                              store.components?.data?.map((c) => ({
                                id: c.id,
                                title: c.title,
                              })) || []
                            }
                            placeholder="Selecione o componente"
                            itemComponent={(props) => (
                              <SelectItem item={props.item}>
                                {props.item.rawValue?.title || ""}
                              </SelectItem>
                            )}
                            optionValue={(value) => +value.id}
                            optionTextValue={(value) => value.title}
                          >
                            <SelectTrigger
                              aria-label="Components"
                              class="w-full"
                            >
                              <SelectValue<{ title: string }>>
                                {(state) => {
                                  return state.selectedOption()?.title || "";
                                }}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent />
                          </Select>
                          <Button
                            variant="secondary"
                            size="icon"
                            onClick={() => removeAnswer(index(), answerIndex())}
                          >
                            <SquareMinus />
                          </Button>
                        </div>
                      </div>
                    )}
                  </For>
                </TextField>
                <div class="flex gap-2">
                  <Button onMouseDown={() => addAnswer(index())}>
                    Adicionar resposta
                  </Button>
                  <Button onMouseDown={() => removeQuestion(index())}>
                    Remover pergunta
                  </Button>
                  <Show
                    when={
                      questions.length === 0 || questions.length - 1 === index()
                    }
                  >
                    <Button onMouseDown={() => addQuestion()}>
                      Adicionar pergunta
                    </Button>
                  </Show>
                </div>
              </div>
            )}
          </For>
          <Show when={questions.length === 0}>
            <Button onMouseDown={() => addQuestion()}>
              Adicionar pergunta
            </Button>
          </Show>
        </div>
      </div>
    </main>
  );
}
