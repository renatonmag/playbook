import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  onMount,
  untrack,
} from "solid-js";
import { parseMarkdown } from "~/lib/parseMarkdown";
import { useStore } from "~/store/storeContext";
import { useParams } from "@solidjs/router";
import { Setup2 } from "~/db/schema";
import { useQuery } from "@tanstack/solid-query";
import { client, orpc } from "~/lib/orpc";
import { createStore, produce, reconcile, unwrap } from "solid-js/store";
import { ImageDialog } from "~/components/trade/ImageDialog";
import { RefsDialog, BarRef } from "~/components/trade/RefsDialog";
import { EvolutionDialog } from "~/components/trade/EvolutionDialog";
import { LeftPanel } from "~/components/trade/LeftPanel";
import { MiddlePanel } from "~/components/trade/MiddlePanel";
import { RightPanel } from "~/components/trade/RightPanel";
import { DialogSessionStrategies } from "~/components/DialogSessionStrategies";

type SetupCard = { id: string; setups: Setup2[] };

export default function Trade() {
  const [store, actions] = useStore(),
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

  const [setups, setSetups] = createStore<{
    version: number;
    items: SetupCard[];
  }>({
    version: 0,
    items: [
      {
        id: crypto.randomUUID(),
        setups: [
          {
            version: 0,
            id: crypto.randomUUID(),
            selectedComps: [],
            result: "",
            setupNumber: 1,
          },
        ],
      },
    ],
  });

  const params = useParams();

  const [sessionStrategies, setSessionStrategies] = createSignal<number[]>([]);
  const [showStrategiesDialog, setShowStrategiesDialog] = createSignal(false);
  const [assets, setAssets] = createSignal<string[]>([]);
  const [selectedAsset, setSelectedAsset] = createSignal<string | undefined>();

  const sessionQuery = useQuery(() => ({
    queryKey: ["trade", "session", params.id],
    queryFn: () => client.trade.getById({ id: Number(params.id) }),
    enabled: !!params.id,
  }));

  const componentsList = useQuery(() =>
    orpc.component.listByUser.queryOptions({}),
  );

  const strategiesList = useQuery(() =>
    orpc.strategy.listByUser.queryOptions({}),
  );

  // Load: group raw Setup2[] by cardId, and load session strategies
  createEffect(() => {
    const _setups = sessionQuery.data;
    if (!_setups?.setups2) return;

    const stratIds: number[] = (_setups as any).strategies ?? [];
    setSessionStrategies(stratIds);
    if (stratIds.length === 0) setShowStrategiesDialog(true);

    const raw: any[] = _setups.setups2;
    for (const s of raw) {
      for (const sc of s.selectedComps ?? [])
        if (!sc.instanceId) sc.instanceId = crypto.randomUUID();
      for (const tc of (s as any).truth ?? [])
        if (!tc.instanceId) tc.instanceId = crypto.randomUUID();
    }
    const grouped = new Map<string, Setup2[]>();
    for (const s of raw) {
      const key = s.cardId ?? s.id; // backward compat: old data each Setup2 is its own card
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(s);
    }
    const cards: SetupCard[] = [...grouped.entries()].map(([id, setups]) => ({
      id,
      setups,
    }));
    setSetups("items", reconcile(structuredClone(unwrap(cards))));

    const loadedAssets = [
      ...new Set(raw.map((s: any) => s.asset as string).filter(Boolean)),
    ];
    setAssets(loadedAssets);
    if (loadedAssets.length > 0 && !selectedAsset())
      setSelectedAsset(loadedAssets[0]);
  });

  // Save: flatten cards into Setup2[] with cardId field (debounced 300ms)
  createEffect(() => {
    if (setups.version === 0) return;

    const id = Number(params.id);
    const payload = untrack(() =>
      setups.items.flatMap((card) =>
        card.setups.map((s) => ({ ...s, cardId: card.id })),
      ),
    );

    const timer = setTimeout(() => {
      actions.updateSession.mutate({ id, setups: payload });
    }, 500);
    onCleanup(() => clearTimeout(timer));
  });

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

  const addSetupImage = (
    cardIdx: number,
    subIdx: number,
    img: { uri: string; key: string },
  ) => {
    setSetups(
      produce((s) => {
        const setup = s.items[cardIdx].setups[subIdx] as any;
        if (!setup.images) setup.images = [];
        setup.images.push(img);
        s.version++;
      }),
    );
  };

  const removeSetupImage = (cardIdx: number, subIdx: number, key: string) => {
    setSetups(
      produce((s) => {
        const setup = s.items[cardIdx].setups[subIdx] as any;
        if (setup.images)
          setup.images = setup.images.filter((i: any) => i.key !== key);
        s.version++;
      }),
    );
  };

  const nextSetupNumber = () => {
    const all = setups.items.flatMap((c) => c.setups);
    const max = Math.max(0, ...all.map((s, i) => s.setupNumber ?? i + 1));
    return max + 1;
  };

  // Add a new card with one empty sub-setup
  const addCard = (asset?: string) => {
    const cardAsset = asset ?? selectedAsset();
    const newCardId = crypto.randomUUID();
    const setupNumber = nextSetupNumber();
    setSetups(
      produce((draft) => {
        draft.version++;
        draft.items = [
          ...draft.items,
          {
            id: newCardId,
            setups: [
              {
                version: 0,
                id: crypto.randomUUID(),
                selectedComps: [],
                result: "",
                setupNumber,
                asset: cardAsset,
              },
            ],
          },
        ];
        return draft;
      }),
    );
    setSelectedSetup([setups.items.length - 1, 0]);
  };

  // Add a sub-setup within an existing card
  const addSubSetup = (cardIndex: number) => {
    const setupNumber = nextSetupNumber();
    const cardAsset = setups.items[cardIndex]?.setups[0]?.asset;
    setSetups(
      produce((draft) => {
        draft.items[cardIndex].setups.push({
          version: 0,
          id: crypto.randomUUID(),
          selectedComps: [],
          result: "",
          setupNumber,
          asset: cardAsset,
        });
        draft.version++;
        return draft;
      }),
    );
    setSelectedSetup([cardIndex, setups.items[cardIndex].setups.length - 1]);
  };

  // Delete sub-setup; remove card if it was the last one
  const deleteSetup = (cardIdx: number, subIdx: number) => {
    setSetups(
      produce((draft) => {
        draft.items[cardIdx].setups.splice(subIdx, 1);
        if (draft.items[cardIdx].setups.length === 0) {
          draft.items.splice(cardIdx, 1);
        }
        draft.version++;
        return draft;
      }),
    );
  };

  const addSelectedComps = (sel: [number, number] | undefined, id: number) => {
    if (!sel) {
      alert("Selecione um setup");
      return;
    }
    const [cardIdx, subIdx] = sel;
    if (!setups.items?.[cardIdx]?.setups?.[subIdx]?.selectedComps) {
      alert("Selecione um setup");
      return;
    }
    const newInstanceId = crypto.randomUUID();
    setSetups(
      produce((draft) => {
        const setup = draft.items[cardIdx].setups[subIdx];
        setup.selectedComps = [
          ...setup.selectedComps,
          { component: id, details: [], instanceId: newInstanceId },
        ];
        setup.version++;
        draft.version++;
        return draft;
      }),
    );
    setTaggedComps([newInstanceId, id, cardIdx, subIdx, "main-component"]);
  };

  const removeSelectedComps = (cardIdx: number, subIdx: number, instanceId: string) => {
    setSetups(
      produce((draft) => {
        const setup = draft.items[cardIdx].setups[subIdx];
        setup.selectedComps = setup.selectedComps.filter(
          (e) => e.instanceId !== instanceId,
        );
        setup.version++;
        draft.version++;
        return draft;
      }),
    );
  };

  // Reads taggedComps to know which setup to add the detail to.
  // Routes to truth[] if the tagged component lives there.
  const addDetails = (insertId: number) => {
    const tagged = taggedComps();
    if (!tagged) return;
    const [instanceId, , cardIdx, subIdx] = tagged;
    const truth: any[] =
      (setups.items[cardIdx].setups[subIdx] as any).truth ?? [];
    const isInTruth = truth.some((c: any) => c.instanceId === instanceId);
    setSetups(
      produce((draft) => {
        const s = draft.items[cardIdx].setups[subIdx] as any;
        if (isInTruth) {
          const comp = (s.truth ?? []).find(
            (c: any) => c.instanceId === instanceId,
          );
          if (!comp) return;
          comp.details = [...(comp.details ?? []), insertId];
        } else {
          const comp = s.selectedComps.find(
            (e: any) => e.instanceId === instanceId,
          );
          if (!comp) return;
          comp.details = [...comp.details, insertId];
        }
        s.version++;
        draft.version++;
        return draft;
      }),
    );
  };

  const removeDetails = (
    cardIdx: number,
    subIdx: number,
    instanceId: string,
    detailId: number,
  ) => {
    setSetups(
      produce((draft) => {
        const setup = draft.items[cardIdx].setups[subIdx];
        const component = setup.selectedComps.find(
          (e) => e.instanceId === instanceId,
        );
        if (!component) return;
        component.details = component.details.filter((e) => e !== detailId);
        setup.version++;
        draft.version++;
        return draft;
      }),
    );
  };

  const addContext = (cardIdx: number, subIdx: number, id: number) => {
    setSetups(
      produce((draft) => {
        const setup = draft.items[cardIdx].setups[subIdx] as any;
        setup.contextComps = [...(setup.contextComps || []), id];
        setup.version++;
        draft.version++;
        return draft;
      }),
    );
  };

  const removeContext = (cardIdx: number, subIdx: number, id: number) => {
    setSetups(
      produce((draft) => {
        const setup = draft.items[cardIdx].setups[subIdx] as any;
        setup.contextComps = (setup.contextComps || []).filter(
          (e: number) => e !== id,
        );
        setup.version++;
        draft.version++;
        return draft;
      }),
    );
  };

  const setResult = (cardIdx: number, subIdx: number, result: string) => {
    setSetups(
      produce((draft) => {
        const setup = draft.items[cardIdx].setups[subIdx];
        setup.result = result;
        draft.version++;
        return draft;
      }),
    );
  };

  const openRefsDialog = (cardIdx: number, subIdx: number) => {
    const existing = unwrap(
      (setups.items[cardIdx].setups[subIdx] as any).refs ?? [],
    );
    setRefsDraft(reconcile(structuredClone(existing)));
    setRefsDialogTarget([cardIdx, subIdx]);
  };

  const saveRefs = () => {
    const target = refsDialogTarget();
    if (!target) return;
    const [cardIdx, subIdx] = target;
    setSetups(
      produce((draft) => {
        (draft.items[cardIdx].setups[subIdx] as any).refs = unwrap(refsDraft);
        draft.items[cardIdx].setups[subIdx].version++;
        draft.version++;
        return draft;
      }),
    );
    setRefsDialogTarget(undefined);
  };

  const toggleVerdade = (cardIdx: number, subIdx: number) => {
    const current =
      (setups.items[cardIdx].setups[subIdx] as any).showTruth ?? false;
    setSetups(
      produce((draft) => {
        (draft.items[cardIdx].setups[subIdx] as any).showTruth = !current;
        draft.version++;
        return draft;
      }),
    );
    if (!current) {
      setVerdadeTarget([cardIdx, subIdx]);
    } else {
      const v = verdadeTarget();
      if (v && v[0] === cardIdx && v[1] === subIdx) setVerdadeTarget(undefined);
    }
  };

  const openEvolutionDialog = (cardIdx: number, subIdx: number) => {
    setEvolutionDialogTarget([cardIdx, subIdx]);
  };

  const setEvolution = (
    cardIdx: number,
    subIdx: number,
    evolution: number | undefined,
  ) => {
    setSetups(
      produce((draft) => {
        (draft.items[cardIdx].setups[subIdx] as any).evolution = evolution;
        draft.items[cardIdx].setups[subIdx].version++;
        draft.version++;
        return draft;
      }),
    );
  };

  const addTruthComp = (id: number) => {
    const target = verdadeTarget();
    if (!target) return;
    const [cardIdx, subIdx] = target;
    const truth: any[] =
      (setups.items[cardIdx].setups[subIdx] as any).truth ?? [];
    setSetups(
      produce((draft) => {
        const s = draft.items[cardIdx].setups[subIdx] as any;
        s.truth = [...(s.truth ?? []), { component: id, details: [], instanceId: crypto.randomUUID() }];
        draft.version++;
        return draft;
      }),
    );
  };

  const removeTruthComp = (cardIdx: number, subIdx: number, instanceId: string) => {
    setSetups(
      produce((draft) => {
        const s = draft.items[cardIdx].setups[subIdx] as any;
        s.truth = (s.truth ?? []).filter((c: any) => c.instanceId !== instanceId);
        draft.version++;
        return draft;
      }),
    );
  };

  const removeTruthDetail = (
    cardIdx: number,
    subIdx: number,
    instanceId: string,
    detailId: number,
  ) => {
    setSetups(
      produce((draft) => {
        const s = draft.items[cardIdx].setups[subIdx] as any;
        const comp = (s.truth ?? []).find(
          (c: any) => c.instanceId === instanceId,
        );
        if (!comp) return;
        comp.details = (comp.details ?? []).filter(
          (e: number) => e !== detailId,
        );
        draft.version++;
        return draft;
      }),
    );
  };

  const moveComponent = (
    cardIdx: number,
    subIdx: number,
    instanceId: string,
    direction: "left" | "right",
  ) => {
    setSetups(
      produce((draft) => {
        const setup = draft.items[cardIdx].setups[subIdx];
        const idx = setup.selectedComps.findIndex(
          (c) => c.instanceId === instanceId,
        );
        if (idx === -1) return draft;
        const newIdx = direction === "left" ? idx - 1 : idx + 1;
        if (newIdx < 0 || newIdx >= setup.selectedComps.length) return draft;
        [setup.selectedComps[idx], setup.selectedComps[newIdx]] = [
          setup.selectedComps[newIdx],
          setup.selectedComps[idx],
        ];
        setup.version++;
        draft.version++;
        return draft;
      }),
    );
  };

  const copyComponentToSetup = (
    srcCard: number,
    srcSub: number,
    instanceId: string,
  ) => {
    const target = selectedSetup();
    if (!target) return;
    const [targetCard, targetSub] = target;
    if (targetCard === srcCard && targetSub === srcSub) return;

    const sourceComp = setups.items[srcCard].setups[srcSub].selectedComps.find(
      (c) => c.instanceId === instanceId,
    );
    if (!sourceComp) return;

    setSetups(
      produce((draft) => {
        const tgt = draft.items[targetCard].setups[targetSub];
        tgt.selectedComps = [
          ...tgt.selectedComps,
          {
            component: sourceComp.component,
            details: [...sourceComp.details],
            instanceId: crypto.randomUUID(),
          },
        ];
        tgt.version++;
        draft.version++;
        return draft;
      }),
    );
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
    moveComponent(
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
    const allSetups = setups.items.flatMap((c) => c.setups);
    const currentId = (setups.items[target[0]]?.setups[target[1]] as any)?.id;
    return allSetups
      .map((s, i) => (s as any).setupNumber ?? i + 1)
      .filter((_, i) => (allSetups[i] as any).id !== currentId);
  });

  const evolutionCurrent = createMemo(() => {
    const target = evolutionDialogTarget();
    if (!target) return undefined;
    return (setups.items[target[0]]?.setups[target[1]] as any)?.evolution;
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
          actions.updateSessionStrategies.mutate({
            id: Number(params.id),
            strategies: ids,
          });
          // Stamp initial asset on the first card's setup
          setSetups(
            produce((draft) => {
              if (draft.items[0]?.setups[0]) {
                draft.items[0].setups[0].asset = asset;
              }
              draft.version++;
            }),
          );
          setAssets([asset]);
          setSelectedAsset(asset);
        }}
      />
      <ImageDialog
        open={sheetOpen()}
        onClose={() => setSelectedSheetId(undefined)}
        selectedSheetId={selectedSheetId}
        setups={setups}
        addSetupImage={addSetupImage}
        removeSetupImage={removeSetupImage}
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
          setEvolution(target[0], target[1], num);
        }}
      />
      <LeftPanel
        filteredItems={filteredItems}
        search={search}
        handleSearchInput={handleSearchInput}
        selectedSetup={selectedSetup}
        verdadeTarget={verdadeTarget}
        loadComponent={actions.loadComponent}
        setShowItem={setShowItem}
        addTruthComp={addTruthComp}
        addSelectedComps={addSelectedComps}
        addDetails={addDetails}
        addContext={addContext}
        taggedComps={taggedComps}
        componentsData={componentsList.data}
        removeComps={(id) => {
          const sel = selectedSetup();
          if (sel) removeSelectedComps(sel[0], sel[1], id);
        }}
        onManageStrategies={() => setShowStrategiesDialog(true)}
      />
      <MiddlePanel
        setups={setups}
        selectedSetup={selectedSetup}
        setSelectedSetup={setSelectedSetup}
        taggedComps={taggedComps}
        verdadeTarget={verdadeTarget}
        componentsData={componentsList.data}
        isActiveSetup={isActiveSetup}
        createSelectedComps={createSelectedComps}
        addCard={addCard}
        addSubSetup={addSubSetup}
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
        deleteSetup={deleteSetup}
        setResult={setResult}
        openRefsDialog={openRefsDialog}
        toggleVerdade={toggleVerdade}
        removeSelectedComps={removeSelectedComps}
        removeDetails={removeDetails}
        removeTruthComp={removeTruthComp}
        removeTruthDetail={removeTruthDetail}
        tagComponent={tagComponent}
        untagComponent={untagComponent}
        copyComponentToSetup={copyComponentToSetup}
        moveComponent={moveComponent}
        setSelectedSheetId={setSelectedSheetId}
        loadComponent={actions.loadComponent}
        setShowItem={setShowItem}
        openEvolutionDialog={openEvolutionDialog}
      />
      <RightPanel component={component} showItem={showItem} html={html} />
    </main>
  );
}
