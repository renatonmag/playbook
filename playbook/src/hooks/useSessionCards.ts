import {
  createEffect,
  createResource,
  createSignal,
  onCleanup,
} from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import { client } from "~/lib/orpc";
import type { Setup2 } from "~/db/schema";

export type SetupCard = { id: string; setups: (Setup2 & { [key: string]: any })[] };

function groupByCardId(raw: any[]): SetupCard[] {
  const grouped = new Map<string, any[]>();
  for (const s of raw) {
    const copy = {
      ...s,
      selectedComps: (s.selectedComps ?? []).map((sc: any) => ({
        ...sc,
        instanceId: sc.instanceId ?? crypto.randomUUID(),
      })),
      truth: (s.truth ?? []).map((tc: any) => ({
        ...tc,
        instanceId: tc.instanceId ?? crypto.randomUUID(),
      })),
    };
    const key = copy.cardId ?? copy.id;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(copy);
  }
  return [...grouped.entries()].map(([id, setups]) => ({ id, setups }));
}

function flattenCards(cards: SetupCard[]): any[] {
  return cards.flatMap((card) =>
    card.setups.map((s) => ({ ...s, cardId: card.id })),
  );
}

export function useSessionCards(sessionId: () => string) {
  const [session, { refetch }] = createResource(
    sessionId,
    (id) => client.trade.getById({ id: Number(id) }),
  );

  const [cardsStore, setCardsStore] = createStore<{ list: SetupCard[] }>({ list: [] });
  const cards = () => cardsStore.list;

  createEffect(() => {
    const data = session();
    if (!data?.setups2) return;
    setCardsStore("list", reconcile(groupByCardId(data.setups2), { key: "id" }));
  });

  const [sessionStrategies, setSessionStrategies] = createSignal<number[]>([]);
  const [showStrategiesDialog, setShowStrategiesDialog] = createSignal(false);
  const [assets, setAssets] = createSignal<string[]>([]);
  const [selectedAsset, setSelectedAsset] = createSignal<string | undefined>();
  let initialLoadDone = false;

  createEffect(() => {
    const data = session();
    if (!data?.setups2 || initialLoadDone) return;
    initialLoadDone = true;
    const stratIds: number[] = (data as any).strategies ?? [];
    setSessionStrategies(stratIds);
    if (stratIds.length === 0) setShowStrategiesDialog(true);
    const loadedAssets = [
      ...new Set(
        data.setups2.map((s: any) => s.asset as string).filter(Boolean),
      ),
    ];
    setAssets(loadedAssets);
    if (loadedAssets.length > 0 && !selectedAsset())
      setSelectedAsset(loadedAssets[0]);
  });

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleSave = (flattened: any[]) => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      saveTimer = undefined;
      try {
        await client.trade.update({
          id: Number(sessionId()),
          setups: flattened,
        });
      } catch {
        refetch();
      }
    }, 500);
  };
  onCleanup(() => clearTimeout(saveTimer));

  const updateCards = (updater: (cards: SetupCard[]) => SetupCard[]) => {
    const next = updater(structuredClone(unwrap(cardsStore.list)));
    setCardsStore("list", reconcile(next, { key: "id" }));
    scheduleSave(flattenCards(next));
  };

  const nextSetupNumber = () => {
    const all = cards().flatMap((c) => c.setups);
    const max = Math.max(0, ...all.map((s, i) => (s as any).setupNumber ?? i + 1));
    return max + 1;
  };

  const addSetupImage = (
    cardIdx: number,
    subIdx: number,
    img: { uri: string; key: string },
  ) => {
    updateCards((cards) => {
      const setup = cards[cardIdx].setups[subIdx] as any;
      if (!setup.images) setup.images = [];
      setup.images.push(img);
      return cards;
    });
  };

  const removeSetupImage = (cardIdx: number, subIdx: number, key: string) => {
    updateCards((cards) => {
      const setup = cards[cardIdx].setups[subIdx] as any;
      if (setup.images)
        setup.images = setup.images.filter((i: any) => i.key !== key);
      return cards;
    });
  };

  const addCard = (asset?: string): { cardIndex: number } => {
    const cardAsset = asset ?? selectedAsset();
    const newCardId = crypto.randomUUID();
    const setupNumber = nextSetupNumber();
    let newCardIndex = 0;
    updateCards((cards) => {
      newCardIndex = cards.length;
      cards.push({
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
      });
      return cards;
    });
    return { cardIndex: newCardIndex };
  };

  const addSubSetup = (
    cardIndex: number,
  ): { cardIndex: number; subIndex: number } => {
    const setupNumber = nextSetupNumber();
    const cardAsset = cards()[cardIndex]?.setups[0]?.asset;
    let newSubIndex = 0;
    updateCards((cards) => {
      newSubIndex = cards[cardIndex].setups.length;
      cards[cardIndex].setups.push({
        version: 0,
        id: crypto.randomUUID(),
        selectedComps: [],
        result: "",
        setupNumber,
        asset: cardAsset,
      });
      return cards;
    });
    return { cardIndex, subIndex: newSubIndex };
  };

  const deleteSetup = (cardIdx: number, subIdx: number) => {
    updateCards((cards) => {
      cards[cardIdx].setups.splice(subIdx, 1);
      if (cards[cardIdx].setups.length === 0) {
        cards.splice(cardIdx, 1);
      }
      return cards;
    });
  };

  const addSelectedComps = (
    cardIdx: number,
    subIdx: number,
    id: number,
  ): string => {
    const newInstanceId = crypto.randomUUID();
    updateCards((cards) => {
      const setup = cards[cardIdx].setups[subIdx];
      setup.selectedComps = [
        ...setup.selectedComps,
        { component: id, details: [], instanceId: newInstanceId },
      ];
      (setup as any).version = ((setup as any).version ?? 0) + 1;
      return cards;
    });
    return newInstanceId;
  };

  const removeSelectedComps = (
    cardIdx: number,
    subIdx: number,
    instanceId: string,
  ) => {
    updateCards((cards) => {
      const setup = cards[cardIdx].setups[subIdx];
      setup.selectedComps = setup.selectedComps.filter(
        (e) => e.instanceId !== instanceId,
      );
      (setup as any).version = ((setup as any).version ?? 0) + 1;
      return cards;
    });
  };

  const addDetails = (
    instanceId: string,
    cardIdx: number,
    subIdx: number,
    insertId: number,
  ) => {
    updateCards((cards) => {
      const s = cards[cardIdx].setups[subIdx] as any;
      const isInTruth = (s.truth ?? []).some(
        (c: any) => c.instanceId === instanceId,
      );
      if (isInTruth) {
        const comp = (s.truth ?? []).find(
          (c: any) => c.instanceId === instanceId,
        );
        if (comp) comp.details = [...(comp.details ?? []), insertId];
      } else {
        const comp = s.selectedComps.find(
          (e: any) => e.instanceId === instanceId,
        );
        if (comp) comp.details = [...comp.details, insertId];
      }
      s.version = (s.version ?? 0) + 1;
      return cards;
    });
  };

  const removeDetails = (
    cardIdx: number,
    subIdx: number,
    instanceId: string,
    detailId: number,
  ) => {
    updateCards((cards) => {
      const setup = cards[cardIdx].setups[subIdx];
      const component = setup.selectedComps.find(
        (e) => e.instanceId === instanceId,
      );
      if (component) {
        component.details = component.details.filter((e) => e !== detailId);
        (setup as any).version = ((setup as any).version ?? 0) + 1;
      }
      return cards;
    });
  };

  const addContext = (cardIdx: number, subIdx: number, id: number) => {
    updateCards((cards) => {
      const setup = cards[cardIdx].setups[subIdx] as any;
      setup.contextComps = [...(setup.contextComps || []), id];
      setup.version = (setup.version ?? 0) + 1;
      return cards;
    });
  };

  const removeContext = (cardIdx: number, subIdx: number, id: number) => {
    updateCards((cards) => {
      const setup = cards[cardIdx].setups[subIdx] as any;
      setup.contextComps = (setup.contextComps || []).filter(
        (e: number) => e !== id,
      );
      setup.version = (setup.version ?? 0) + 1;
      return cards;
    });
  };

  const setResult = (cardIdx: number, subIdx: number, result: string) => {
    updateCards((cards) => {
      cards[cardIdx].setups[subIdx].result = result;
      return cards;
    });
  };

  const saveRefs = (cardIdx: number, subIdx: number, refs: any[]) => {
    updateCards((cards) => {
      const s = cards[cardIdx].setups[subIdx] as any;
      s.refs = refs;
      s.version = (s.version ?? 0) + 1;
      return cards;
    });
  };

  const toggleVerdade = (cardIdx: number, subIdx: number): boolean => {
    const current = (cards()[cardIdx].setups[subIdx] as any).showTruth ?? false;
    const newValue = !current;
    updateCards((cards) => {
      (cards[cardIdx].setups[subIdx] as any).showTruth = newValue;
      return cards;
    });
    return newValue;
  };

  const setEvolution = (
    cardIdx: number,
    subIdx: number,
    evolution: number | undefined,
  ) => {
    updateCards((cards) => {
      const s = cards[cardIdx].setups[subIdx] as any;
      s.evolution = evolution;
      s.version = (s.version ?? 0) + 1;
      return cards;
    });
  };

  const addTruthComp = (cardIdx: number, subIdx: number, id: number) => {
    updateCards((cards) => {
      const s = cards[cardIdx].setups[subIdx] as any;
      s.truth = [
        ...(s.truth ?? []),
        { component: id, details: [], instanceId: crypto.randomUUID() },
      ];
      return cards;
    });
  };

  const removeTruthComp = (
    cardIdx: number,
    subIdx: number,
    instanceId: string,
  ) => {
    updateCards((cards) => {
      const s = cards[cardIdx].setups[subIdx] as any;
      s.truth = (s.truth ?? []).filter(
        (c: any) => c.instanceId !== instanceId,
      );
      return cards;
    });
  };

  const removeTruthDetail = (
    cardIdx: number,
    subIdx: number,
    instanceId: string,
    detailId: number,
  ) => {
    updateCards((cards) => {
      const s = cards[cardIdx].setups[subIdx] as any;
      const comp = (s.truth ?? []).find(
        (c: any) => c.instanceId === instanceId,
      );
      if (comp) {
        comp.details = (comp.details ?? []).filter(
          (e: number) => e !== detailId,
        );
      }
      return cards;
    });
  };

  const moveComponent = (
    cardIdx: number,
    subIdx: number,
    instanceId: string,
    direction: "left" | "right",
  ) => {
    updateCards((cards) => {
      const setup = cards[cardIdx].setups[subIdx];
      const idx = setup.selectedComps.findIndex(
        (c) => c.instanceId === instanceId,
      );
      if (idx === -1) return cards;
      const newIdx = direction === "left" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= setup.selectedComps.length) return cards;
      [setup.selectedComps[idx], setup.selectedComps[newIdx]] = [
        setup.selectedComps[newIdx],
        setup.selectedComps[idx],
      ];
      (setup as any).version = ((setup as any).version ?? 0) + 1;
      return cards;
    });
  };

  const copyComponentToSetup = (
    srcCard: number,
    srcSub: number,
    instanceId: string,
    targetCard: number,
    targetSub: number,
  ) => {
    const sourceComp = cards()[srcCard]?.setups[srcSub]?.selectedComps.find(
      (c) => c.instanceId === instanceId,
    );
    if (!sourceComp) return;
    updateCards((cards) => {
      const tgt = cards[targetCard].setups[targetSub];
      tgt.selectedComps = [
        ...tgt.selectedComps,
        {
          component: sourceComp.component,
          details: [...sourceComp.details],
          instanceId: crypto.randomUUID(),
        },
      ];
      (tgt as any).version = ((tgt as any).version ?? 0) + 1;
      return cards;
    });
  };

  const setSetupAsset = (cardIdx: number, subIdx: number, asset: string) => {
    updateCards((cards) => {
      (cards[cardIdx].setups[subIdx] as any).asset = asset;
      return cards;
    });
  };

  return {
    session,
    cards,
    sessionStrategies,
    setSessionStrategies,
    showStrategiesDialog,
    setShowStrategiesDialog,
    assets,
    setAssets,
    selectedAsset,
    setSelectedAsset,
    actions: {
      addSetupImage,
      removeSetupImage,
      addCard,
      addSubSetup,
      deleteSetup,
      addSelectedComps,
      removeSelectedComps,
      addDetails,
      removeDetails,
      addContext,
      removeContext,
      setResult,
      saveRefs,
      toggleVerdade,
      setEvolution,
      addTruthComp,
      removeTruthComp,
      removeTruthDetail,
      moveComponent,
      copyComponentToSetup,
      setSetupAsset,
    },
  };
}
