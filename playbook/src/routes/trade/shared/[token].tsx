import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  Show,
} from "solid-js";
import X from "lucide-solid/icons/x";
import { useParams } from "@solidjs/router";
import { client } from "~/lib/orpc";
import { createStore, reconcile } from "solid-js/store";
import { groupByCardId, type SetupCard } from "~/hooks/useSessionCards";
import { useSessionRealtime } from "~/hooks/useSessionRealtime";
import { MiddlePanel } from "~/components/trade/MiddlePanel";

const noop = () => {};

export default function SharedSession() {
  const params = useParams();

  const [session] = createResource(
    () => params.token,
    (token) => client.trade.getByShareToken({ token }),
  );

  const [cardsStore, setCardsStore] = createStore<{ list: SetupCard[] }>({
    list: [],
  });
  const cards = () => cardsStore.list;

  createEffect(() => {
    const data = session();
    if (!data?.setups2) return;
    setCardsStore(
      "list",
      reconcile(groupByCardId(data.setups2), { key: "id" }),
    );
  });

  useSessionRealtime({
    sessionId: () => session()?.id,
    onUpdate: (newSetups2) => {
      setCardsStore(
        "list",
        reconcile(groupByCardId(newSetups2), { key: "id" }),
      );
    },
  });

  const [bannerVisible, setBannerVisible] = createSignal(true);

  const [selectedSetup, setSelectedSetup] = createSignal<
    [number, number] | undefined
  >();
  const [selectedAsset, setSelectedAsset] = createSignal<string | undefined>();

  const assets = createMemo(() => {
    const data = session();
    if (!data?.setups2) return [];
    return [
      ...new Set(
        data.setups2.map((s: any) => s.asset as string).filter(Boolean),
      ),
    ];
  });

  const isActiveSetup = (cardIndex: number, subIndex: number) => {
    const sel = selectedSetup();
    return sel !== undefined && sel[0] === cardIndex && sel[1] === subIndex;
  };

  const createSelectedComps = (setup: any, allComps?: any) => {
    if (!allComps) return [];
    return setup.selectedComps.map((e: any) => {
      const component = allComps?.find((c: any) => c.id === e.component);
      const details = (e.details ?? []).map((detailId: any) =>
        allComps?.find((c: any) => c.id === detailId),
      );
      return { ...e, details, component };
    });
  };

  return (
    <main class="flex flex-col w-full h-screen text-gray-800">
      <Show when={bannerVisible()}>
        <div class="relative bg-amber-50 border-b border-amber-200 text-amber-800 text-xs text-center py-1.5 shrink-0">
          Sessão compartilhada — somente leitura
          <button
            class="absolute right-2 top-1/2 -translate-y-1/2 hover:opacity-70"
            onClick={() => setBannerVisible(false)}
          >
            <X size={14} />
          </button>
        </div>
      </Show>
      <div class="flex flex-1 min-h-0 w-full p-1.5 gap-1 justify-center">
        <Show
          when={!session.loading}
          fallback={
            <div class="flex items-center justify-center w-full text-gray-500 text-sm">
              Carregando sessão...
            </div>
          }
        >
          <Show
            when={session()}
            fallback={
              <div class="flex items-center justify-center w-full text-red-500 text-sm">
                Sessão não encontrada ou compartilhamento desativado.
              </div>
            }
          >
            <MiddlePanel
              cards={cards}
              selectedSetup={selectedSetup}
              setSelectedSetup={setSelectedSetup}
              taggedComps={() => undefined}
              verdadeTarget={() => undefined}
              componentsData={session()?.components ?? []}
              isActiveSetup={isActiveSetup}
              createSelectedComps={createSelectedComps}
              addCard={noop}
              addSubSetup={noop}
              assets={assets}
              selectedAsset={selectedAsset}
              setSelectedAsset={setSelectedAsset}
              addAsset={noop}
              deleteSetup={noop}
              setResult={noop}
              openRefsDialog={noop}
              toggleVerdade={noop}
              removeSelectedComps={noop}
              removeDetails={noop}
              removeTruthComp={noop}
              removeTruthDetail={noop}
              tagComponent={noop}
              untagComponent={noop}
              copyComponentToSetup={noop}
              moveComponent={noop}
              setSelectedSheetId={noop}
              loadComponent={noop}
              setShowItem={noop}
              openEvolutionDialog={noop}
              readOnly={true}
            />
          </Show>
        </Show>
      </div>
    </main>
  );
}
