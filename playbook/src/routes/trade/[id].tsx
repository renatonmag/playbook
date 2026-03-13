import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { parseMarkdown } from "~/lib/parseMarkdown";
import { useStore } from "~/store/storeContext";
import { useParams } from "@solidjs/router";
import { createMutation, useQuery } from "@tanstack/solid-query";
import { client, orpc } from "~/lib/orpc";
import { createStore, reconcile, unwrap } from "solid-js/store";
import { ImageDialog } from "~/components/trade/ImageDialog";
import { RefsDialog, BarRef } from "~/components/trade/RefsDialog";
import { EvolutionDialog } from "~/components/trade/EvolutionDialog";
import { LeftPanel } from "~/components/trade/LeftPanel";
import { MiddlePanel } from "~/components/trade/MiddlePanel";
import { RightPanel } from "~/components/trade/RightPanel";
import { DialogSessionStrategies } from "~/components/DialogSessionStrategies";
import { useSessionCards } from "~/hooks/useSessionCards";
import Share2 from "lucide-solid/icons/share-2";

export default function Trade() {
  const [store, storeActions] = useStore(),
    [selectedSheetId, setSelectedSheetId] = createSignal<
      [number, number] | undefined
    >(),
    [selectedSetup, setSelectedSetup] = createSignal<
      [number, number] | undefined
    >(),
    [taggedComps, setTaggedComps] = createSignal<
      [string, number, number, number, string] | undefined
    >(),
    [showItem, setShowItem] = createSignal<string>(""),
    [search, setSearch] = createSignal(""),
    [refsDialogTarget, setRefsDialogTarget] = createSignal<
      [number, number] | undefined
    >(),
    [verdadeTarget, setVerdadeTarget] = createSignal<
      [number, number] | undefined
    >(),
    [evolutionDialogTarget, setEvolutionDialogTarget] = createSignal<
      [number, number] | undefined
    >();

  const [refsDraft, setRefsDraft] = createStore<BarRef[]>([]);

  const params = useParams();

  const {
    cards,
    actions,
    session,
    sessionStrategies,
    setSessionStrategies,
    showStrategiesDialog,
    setShowStrategiesDialog,
    assets,
    setAssets,
    selectedAsset,
    setSelectedAsset,
  } = useSessionCards(() => params.id);

  const [showShareDialog, setShowShareDialog] = createSignal(false);
  const [shareState, setShareState] = createSignal<{
    isShared: boolean;
    shareToken: string | null;
  }>({ isShared: false, shareToken: null });
  const [copySuccess, setCopySuccess] = createSignal(false);

  createEffect(() => {
    const data = session() as any;
    if (!data) return;
    setShareState({
      isShared: data.isShared ?? false,
      shareToken: data.shareToken ?? null,
    });
  });

  const toggleShareMutation = createMutation(() =>
    orpc.trade.toggleShare.mutationOptions({
      onSuccess: (data: any) => {
        setShareState({ isShared: data.isShared, shareToken: data.shareToken });
      },
    }),
  );

  const componentsList = useQuery(() =>
    orpc.component.listByUser.queryOptions({}),
  );

  const strategiesList = useQuery(() =>
    orpc.strategy.listByUser.queryOptions({}),
  );

  const component = createMemo(() => {
    return componentsList.data?.find(
      (e: any) => e.id === store.displayComponentId,
    );
  });

  const isActiveSetup = (cardIndex: number, subIndex: number) => {
    const sel = selectedSetup();
    return sel !== undefined && sel[0] === cardIndex && sel[1] === subIndex;
  };

  const sheetOpen = () => {
    const sel = selectedSetup();
    const sheet = selectedSheetId();
    return (
      sel !== undefined &&
      sheet !== undefined &&
      sel[0] === sheet[0] &&
      sel[1] === sheet[1]
    );
  };

  // Thin wrappers bridging UI signals with hook actions

  const handleAddSelectedComps = (
    sel: [number, number] | undefined,
    id: number,
  ) => {
    if (!sel) {
      alert("Selecione um setup");
      return;
    }
    const [cardIdx, subIdx] = sel;
    if (!cards()?.[cardIdx]?.setups?.[subIdx]) {
      alert("Selecione um setup");
      return;
    }
    const newInstanceId = actions.addSelectedComps(cardIdx, subIdx, id);
    setTaggedComps([newInstanceId, id, cardIdx, subIdx, "main-component"]);
  };

  const handleAddDetails = (insertId: number) => {
    const tagged = taggedComps();
    if (!tagged) return;
    const [instanceId, , cardIdx, subIdx] = tagged;
    actions.addDetails(instanceId, cardIdx, subIdx, insertId);
  };

  const handleAddCard = (asset?: string) => {
    const { cardIndex } = actions.addCard(asset);
    setSelectedSetup([cardIndex, 0]);
  };

  const handleAddSubSetup = (cardIndex: number) => {
    const { cardIndex: ci, subIndex } = actions.addSubSetup(cardIndex);
    setSelectedSetup([ci, subIndex]);
  };

  const handleCopyComponentToSetup = (
    srcCard: number,
    srcSub: number,
    instanceId: string,
  ) => {
    const target = selectedSetup();
    if (!target) return;
    const [targetCard, targetSub] = target;
    if (targetCard === srcCard && targetSub === srcSub) return;
    actions.copyComponentToSetup(srcCard, srcSub, instanceId, targetCard, targetSub);
  };

  const handleToggleVerdade = (cardIdx: number, subIdx: number) => {
    const newShowTruth = actions.toggleVerdade(cardIdx, subIdx);
    if (newShowTruth) {
      setVerdadeTarget([cardIdx, subIdx]);
    } else {
      const v = verdadeTarget();
      if (v && v[0] === cardIdx && v[1] === subIdx) setVerdadeTarget(undefined);
    }
  };

  const handleAddTruthComp = (id: number) => {
    const target = verdadeTarget();
    if (!target) return;
    const [cardIdx, subIdx] = target;
    actions.addTruthComp(cardIdx, subIdx, id);
  };

  const openRefsDialog = (cardIdx: number, subIdx: number) => {
    const existing = (cards()[cardIdx]?.setups[subIdx] as any)?.refs ?? [];
    setRefsDraft(reconcile(structuredClone(existing)));
    setRefsDialogTarget([cardIdx, subIdx]);
  };

  const saveRefs = () => {
    const target = refsDialogTarget();
    if (!target) return;
    const [cardIdx, subIdx] = target;
    actions.saveRefs(cardIdx, subIdx, unwrap(refsDraft));
    setRefsDialogTarget(undefined);
  };

  const openEvolutionDialog = (cardIdx: number, subIdx: number) => {
    setEvolutionDialogTarget([cardIdx, subIdx]);
  };

  const tagComponent = (
    instanceId: string,
    id: number,
    cardIdx: number,
    subIdx: number,
    type: string,
  ) => {
    setTaggedComps([instanceId, id, cardIdx, subIdx, type]);
  };

  const untagComponent = () => {
    setTaggedComps(undefined);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!e.ctrlKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    const tagged = taggedComps();
    if (!tagged) return;
    e.preventDefault();
    const [instanceId, , cardIdx, subIdx] = tagged;
    actions.moveComponent(
      cardIdx,
      subIdx,
      instanceId,
      e.key === "ArrowLeft" ? "left" : "right",
    );
  };
  onMount(() => {
    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  const [html] = createResource(
    () => component()?.markdown?.content || "",
    parseMarkdown,
  );

  const filteredItems = createMemo(() => {
    const strategies = sessionStrategies();
    if (strategies.length === 0) return [];
    const query = search().toLowerCase();
    let items = (componentsList.data ?? []).filter((item) =>
      strategies.includes(item.strategyId),
    );
    if (query)
      items = items.filter((item) => item.title.toLowerCase().includes(query));
    return items;
  });

  let timer: ReturnType<typeof setTimeout>;
  const handleSearchInput = (e: any) => {
    clearTimeout(timer);
    const value = e.currentTarget.value;
    timer = setTimeout(() => {
      setSearch(value);
    }, 200);
  };

  const createSelectedComps = (setup: any, allComps?: any) => {
    if (!allComps) return [];
    return setup.selectedComps.map((e: any) => {
      const component = allComps?.find((c: any) => c.id === e.component);
      const details = e.details.map((detailId: any) => {
        return allComps?.find((c: any) => c.id === detailId);
      });
      return { ...e, details, component };
    });
  };

  const evolutionSetupNumbers = createMemo(() => {
    const target = evolutionDialogTarget();
    if (!target) return [];
    const allSetups = cards().flatMap((c) => c.setups);
    const currentId = (cards()[target[0]]?.setups[target[1]] as any)?.id;
    return allSetups
      .map((s, i) => (s as any).setupNumber ?? i + 1)
      .filter((_, i) => (allSetups[i] as any).id !== currentId);
  });

  const evolutionCurrent = createMemo(() => {
    const target = evolutionDialogTarget();
    if (!target) return undefined;
    return (cards()[target[0]]?.setups[target[1]] as any)?.evolution;
  });

  return (
    <main class="flex w-full h-[calc(100vh-52px)] text-gray-800 p-1.5 gap-1">
      <DialogSessionStrategies
        open={showStrategiesDialog()}
        strategies={strategiesList.data ?? []}
        initialSelected={sessionStrategies()}
        onConfirm={(ids, asset) => {
          setSessionStrategies(ids);
          setShowStrategiesDialog(false);
          storeActions.updateSessionStrategies.mutate({
            id: Number(params.id),
            strategies: ids,
          });
          actions.setSetupAsset(0, 0, asset);
          setAssets([asset]);
          setSelectedAsset(asset);
        }}
      />
      <ImageDialog
        open={sheetOpen()}
        onClose={() => setSelectedSheetId(undefined)}
        selectedSheetId={selectedSheetId}
        cards={cards}
        addSetupImage={actions.addSetupImage}
        removeSetupImage={actions.removeSetupImage}
      />
      <RefsDialog
        open={refsDialogTarget() !== undefined}
        onClose={() => setRefsDialogTarget(undefined)}
        refsDraft={refsDraft}
        setRefsDraft={setRefsDraft}
        saveRefs={saveRefs}
      />
      <EvolutionDialog
        open={evolutionDialogTarget() !== undefined}
        onClose={() => setEvolutionDialogTarget(undefined)}
        setupNumbers={evolutionSetupNumbers()}
        currentEvolution={evolutionCurrent()}
        onConfirm={(num) => {
          const target = evolutionDialogTarget();
          if (!target) return;
          actions.setEvolution(target[0], target[1], num);
        }}
      />
      <LeftPanel
        filteredItems={filteredItems}
        search={search}
        handleSearchInput={handleSearchInput}
        selectedSetup={selectedSetup}
        verdadeTarget={verdadeTarget}
        loadComponent={storeActions.loadComponent}
        setShowItem={setShowItem}
        addTruthComp={handleAddTruthComp}
        addSelectedComps={handleAddSelectedComps}
        addDetails={handleAddDetails}
        addContext={actions.addContext}
        taggedComps={taggedComps}
        componentsData={componentsList.data}
        removeComps={(id) => {
          const sel = selectedSetup();
          if (sel) actions.removeSelectedComps(sel[0], sel[1], id);
        }}
        onManageStrategies={() => setShowStrategiesDialog(true)}
      />
      <MiddlePanel
        cards={cards}
        selectedSetup={selectedSetup}
        setSelectedSetup={setSelectedSetup}
        taggedComps={taggedComps}
        verdadeTarget={verdadeTarget}
        componentsData={componentsList.data}
        isActiveSetup={isActiveSetup}
        createSelectedComps={createSelectedComps}
        addCard={handleAddCard}
        addSubSetup={handleAddSubSetup}
        assets={assets}
        selectedAsset={selectedAsset}
        setSelectedAsset={setSelectedAsset}
        addAsset={(name: string) => {
          const upper = name.toUpperCase().trim();
          if (!upper) return;
          if (!assets().includes(upper)) {
            setAssets((prev) => [...prev, upper]);
          }
          setSelectedAsset(upper);
        }}
        deleteSetup={actions.deleteSetup}
        setResult={actions.setResult}
        openRefsDialog={openRefsDialog}
        toggleVerdade={handleToggleVerdade}
        removeSelectedComps={actions.removeSelectedComps}
        removeDetails={actions.removeDetails}
        removeTruthComp={actions.removeTruthComp}
        removeTruthDetail={actions.removeTruthDetail}
        tagComponent={tagComponent}
        untagComponent={untagComponent}
        copyComponentToSetup={handleCopyComponentToSetup}
        moveComponent={actions.moveComponent}
        setSelectedSheetId={setSelectedSheetId}
        loadComponent={storeActions.loadComponent}
        setShowItem={setShowItem}
        openEvolutionDialog={openEvolutionDialog}
      />
      <RightPanel component={component} showItem={showItem} html={html} />

      {/* Share button */}
      <button
        class="fixed bottom-4 right-4 z-10 p-2 bg-white border rounded-full shadow hover:bg-gray-50"
        onClick={() => setShowShareDialog(true)}
        title="Compartilhar sessão"
      >
        <Share2 size={16} />
      </button>

      {/* Share dialog */}
      <Show when={showShareDialog()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div class="bg-white rounded-lg p-6 shadow-xl w-96">
            <h2 class="text-lg font-semibold mb-4">Compartilhar sessão</h2>

            <div class="flex items-center gap-2 mb-4">
              <span class="text-sm text-gray-600">
                {shareState().isShared
                  ? "Compartilhamento ativo"
                  : "Compartilhamento inativo"}
              </span>
              <button
                class="ml-auto px-3 py-1 rounded text-sm bg-blue-600 text-white disabled:opacity-50"
                onClick={() =>
                  toggleShareMutation.mutate({
                    id: Number(params.id),
                    enable: !shareState().isShared,
                  })
                }
                disabled={toggleShareMutation.isPending}
              >
                {shareState().isShared ? "Desativar" : "Ativar"}
              </button>
            </div>

            <Show when={shareState().isShared && shareState().shareToken}>
              <div class="flex gap-2 items-center">
                <input
                  readOnly
                  class="flex-1 text-xs border rounded p-2 bg-gray-50 min-w-0"
                  value={`${window.location.origin}/trade/shared/${shareState().shareToken}`}
                />
                <button
                  class="px-2 py-1 text-xs border rounded hover:bg-gray-100 shrink-0"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `${window.location.origin}/trade/shared/${shareState().shareToken}`,
                    );
                    setCopySuccess(true);
                    setTimeout(() => setCopySuccess(false), 2000);
                  }}
                >
                  {copySuccess() ? "Copiado!" : "Copiar"}
                </button>
              </div>
            </Show>

            <button
              class="mt-4 text-sm text-gray-500 underline"
              onClick={() => setShowShareDialog(false)}
            >
              Fechar
            </button>
          </div>
        </div>
      </Show>
    </main>
  );
}
