import { For, Match, Show, Switch } from "solid-js";
import { ImageCaroulsel } from "~/components/ImageCarousel";
import { UploadButton } from "~/lib/uploadthing";
import { Button } from "~/components/ui/button";
import {
  labelVariants,
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import { Separator } from "~/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import SquareMinus from "lucide-solid/icons/square-minus";
import {
  Combobox,
  ComboboxContent,
  ComboboxControl,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxItemLabel,
  ComboboxSection,
  ComboboxTrigger,
} from "~/components/ui/combobox";
import { cn } from "~/lib/utils";

export type QuestionType = {
  id: string;
  question: string;
  questionFunction: string;
  answers: { answer: string; consequence: number }[];
};

type PatternEditProps = {
  title: string;
  images: { uri: string; key: string }[];
  categories: string;
  markdownContent: string;
  questions: QuestionType[];
  components: { id: number; title: string }[];
  patternId: number;
  detailValue: Food | null;
  editingTitle: boolean;
  onTitleMouseDown: () => void;
  onTitleInput: (val: string) => void;
  onTitleBlur: () => void;
  onDeleteImage: (key: string) => void;
  onUploadComplete: (res: { ufsUrl: string; key: string }[]) => void;
  onCategoriesChange: (val: string) => void;
  onMarkdownInput: (val: string) => void;
  onAddQuestion: () => void;
  onRemoveQuestion: (i: number) => void;
  onEditQuestion: (i: number, val: string) => void;
  onEditQuestionFunction: (i: number, val: string) => void;
  onAddAnswer: (i: number) => void;
  onRemoveAnswer: (i: number, ai: number) => void;
  onEditAnswer: (i: number, ai: number, val: string) => void;
  onEditConsequence: (i: number, ai: number, val: number) => void;
  onDetailValueChange: (val: Food | null) => void;
  onDetailInputChange: (val: string) => void;
  onCreateDetail: () => void;
};

export function PatternEdit(props: PatternEditProps) {
  return (
    <>
      <Switch>
        <Match when={props.editingTitle}>
          <TextField class="w-3/4">
            <TextFieldInput
              onBlur={props.onTitleBlur}
              value={props.title}
              class="text-xl font-bold text-gray-700 mb-4 w-full"
              type="text"
              id="text"
              onInput={(e) => props.onTitleInput(e.currentTarget.value)}
              placeholder="categorias separadas por virgula."
            />
          </TextField>
        </Match>
        <Match when={!props.editingTitle}>
          <div
            class="text-xl font-bold text-gray-700 mb-4"
            onMouseDown={props.onTitleMouseDown}
          >
            {props.title}
          </div>
        </Match>
      </Switch>

      <Show when={props.images.length > 0}>
        <ImageCaroulsel
          class="max-w-lg mb-7"
          images={props.images}
          onDelete={props.onDeleteImage}
        />
      </Show>

      <UploadButton
        class="ut-button:inline-flex ut-button:items-center ut-button:justify-center ut-button:rounded-md ut-button:text-sm ut-button:font-medium ut-button:h-10 ut-button:px-4 ut-button:py-2 ut-button:bg-primary ut-button:text-primary-foreground ut-button:transition-colors ut-button:hover:bg-primary/90 ut-button:ut-readying:bg-primary/70 ut-button:ut-uploading:bg-primary/70 ut-allowed-content:hidden"
        onClientUploadComplete={(res) => {
          props.onUploadComplete(res);
          alert("Upload Completed");
        }}
        onUploadError={(error: Error) => alert(`ERROR! ${error.message}`)}
        content={{
          button({ ready, isUploading }) {
            if (!ready()) return "Preparando...";
            if (isUploading()) return "Enviando...";
            return "Escolher imagem";
          },
        }}
        endpoint="imageUploader"
      />

      <TextField class="grid w-full items-center gap-1.5 mb-6">
        <TextFieldLabel class="col-span-1" for="categories">
          Categoria
        </TextFieldLabel>
        <TextFieldInput
          value={props.categories}
          onChange={(e) => props.onCategoriesChange(e.currentTarget.value)}
          class="col-span-3"
          type="text"
          id="categories"
          placeholder="impulse, pullback, trend, range, etc..."
        />
      </TextField>

      <Separator class="mb-6" />

      <div class="h-full w-full">
        <textarea
          placeholder="Escreva seu texto aqui..."
          id="markdown"
          class="w-full min-h-full outline-none resize-none bg-transparent field-sizing-content"
          onInput={(e) => props.onMarkdownInput(e.currentTarget.value || "")}
        >
          {props.markdownContent}
        </textarea>
      </div>

      <Separator class="my-6" />

      {/* Questions */}
      <div class="w-full mb-6">
        <div class="text-xl font-bold text-gray-700 mb-4">Perguntas</div>
        <For each={props.questions}>
          {(question, index) => (
            <div class="mb-6">
              <TextField class="flex flex-col w-full gap-1.5 mb-6">
                <TextFieldLabel class="col-span-1" for="question">
                  Pergunta
                </TextFieldLabel>
                <TextFieldInput
                  value={question.question}
                  onInput={(e) =>
                    props.onEditQuestion(index(), e.currentTarget.value)
                  }
                  class="col-span-3"
                  type="text"
                  id="question"
                  placeholder="..."
                />
              </TextField>

              <Select
                value={question.questionFunction || ""}
                onChange={(value) =>
                  props.onEditQuestionFunction(index(), value)
                }
                class="mb-6"
                options={["Especificação", "Detalhe", "Contexto"]}
                placeholder="Função da pergunta."
                itemComponent={(itemProps) => (
                  <SelectItem item={itemProps.item}>
                    {itemProps.item.rawValue}
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
                        value={answer.answer}
                        onInput={(e) =>
                          props.onEditAnswer(
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
                          onChange={(value) =>
                            props.onEditConsequence(
                              index(),
                              answerIndex(),
                              value,
                            )
                          }
                          class="flex-1"
                          options={props.components.map((c) => ({
                            id: c.id,
                            parentId: props.patternId,
                            title: c.title,
                          }))}
                          placeholder="Selecione o componente"
                          itemComponent={(itemProps) => (
                            <SelectItem item={itemProps.item}>
                              {itemProps.item.rawValue?.title || ""}
                            </SelectItem>
                          )}
                          optionValue={(value) => +value.id}
                          optionTextValue={(value) => value.title}
                        >
                          <SelectTrigger aria-label="Components" class="w-full">
                            <SelectValue<{ title: string }>>
                              {(state) => state.selectedOption()?.title || ""}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent />
                        </Select>
                        <Button
                          variant="secondary"
                          size="icon"
                          onClick={() =>
                            props.onRemoveAnswer(index(), answerIndex())
                          }
                        >
                          <SquareMinus />
                        </Button>
                      </div>
                    </div>
                  )}
                </For>
              </TextField>

              <div class="flex gap-2">
                <Button onMouseDown={() => props.onAddAnswer(index())}>
                  Adicionar resposta
                </Button>
                <Button onMouseDown={() => props.onRemoveQuestion(index())}>
                  Remover pergunta
                </Button>
                <Show
                  when={
                    props.questions.length === 0 ||
                    props.questions.length - 1 === index()
                  }
                >
                  <Button onMouseDown={props.onAddQuestion}>
                    Adicionar pergunta
                  </Button>
                </Show>
              </div>
            </div>
          )}
        </For>
        <Show when={props.questions.length === 0}>
          <Button onMouseDown={props.onAddQuestion}>Adicionar pergunta</Button>
        </Show>
      </div>

      {/* Details */}
      {/* <div class="w-full">
        <div>
          <div class={cn(labelVariants(), "mb-2")}>Detalhes</div>
          <Combobox<Food, Category>
            options={ALL_OPTIONS}
            value={props.detailValue}
            onChange={props.onDetailValueChange}
            onInputChange={props.onDetailInputChange}
            optionValue="value"
            optionTextValue="label"
            optionLabel="label"
            optionDisabled="disabled"
            optionGroupChildren="options"
            placeholder="Search a food…"
            itemComponent={(itemProps) => (
              <ComboboxItem item={itemProps.item}>
                <ComboboxItemLabel>
                  {itemProps.item.rawValue.label}
                </ComboboxItemLabel>
                <ComboboxItemIndicator />
              </ComboboxItem>
            )}
            sectionComponent={(itemProps) => (
              <ComboboxSection>
                {itemProps.section.rawValue.label}
              </ComboboxSection>
            )}
          >
            <ComboboxControl aria-label="Food">
              <ComboboxInput />
              <ComboboxTrigger />
            </ComboboxControl>
            <ComboboxContent class="w-full max-h-96 overflow-y-auto" />
          </Combobox>
        </div>
        <Button onMouseDown={props.onCreateDetail}>Salvar detalhe</Button>
      </div> */}
    </>
  );
}
