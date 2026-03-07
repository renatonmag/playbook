import { createMemo, createSignal, For, Show } from "solid-js";
import { useQuery } from "@tanstack/solid-query";
import { orpc } from "~/lib/orpc";
import {
  createSolidTable,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
} from "@tanstack/solid-table";
import type { ColumnDef, SortingState } from "@tanstack/solid-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { A } from "@solidjs/router";
import { buttonVariants } from "~/components/ui/button";
import ArrowUpDown from "lucide-solid/icons/arrow-up-down";

type PatternStat = {
  id: number;
  name: string;
  timesUsed: number;
  gains: number;
  losses: number;
  winRate: number | null;
};

const columns: ColumnDef<PatternStat>[] = [
  {
    accessorKey: "name",
    header: "Pattern",
    enableSorting: true,
  },
  {
    accessorKey: "timesUsed",
    header: "Times Used",
    enableSorting: true,
  },
  {
    accessorKey: "gains",
    header: "Gains",
    enableSorting: true,
  },
  {
    accessorKey: "losses",
    header: "Losses",
    enableSorting: true,
  },
  {
    accessorKey: "winRate",
    header: "Win Rate %",
    enableSorting: true,
    cell: (props) => {
      const val = props.getValue<number | null>();
      return val === null ? "—" : `${Math.round(val * 100)}%`;
    },
  },
];

export default function StatsPage() {
  const sessions = useQuery(() => orpc.trade.listByUser.queryOptions({}));
  const components = useQuery(() => orpc.component.listByUser.queryOptions({}));

  const stats = createMemo(() => {
    const sessionsData = sessions.data ?? [];
    const componentsData = components.data ?? [];

    const allSubSetups = sessionsData.flatMap((s) => s.setups2 ?? []);
    const totalSessions = sessionsData.length;

    const gainCount = allSubSetups.filter((s) => s.result === "gain").length;
    const lossCount = allSubSetups.filter((s) => s.result === "loss").length;
    const decisiveCount = gainCount + lossCount;
    const winRate = decisiveCount > 0 ? gainCount / decisiveCount : null;

    const patternMap = new Map<
      number,
      { gains: number; losses: number; timesUsed: number }
    >();

    for (const subSetup of allSubSetups) {
      const isGain = subSetup.result === "gain";
      const isLoss = subSetup.result === "loss";
      for (const sc of subSetup.selectedComps ?? []) {
        const id = sc.component;
        if (!patternMap.has(id)) {
          patternMap.set(id, { gains: 0, losses: 0, timesUsed: 0 });
        }
        const entry = patternMap.get(id)!;
        entry.timesUsed++;
        if (isGain) entry.gains++;
        if (isLoss) entry.losses++;
      }
    }

    const patternStats: PatternStat[] = [];
    for (const [id, entry] of patternMap) {
      const comp = componentsData.find((c) => c.id === id);
      const decisive = entry.gains + entry.losses;
      patternStats.push({
        id,
        name: comp?.title ?? `Pattern #${id}`,
        timesUsed: entry.timesUsed,
        gains: entry.gains,
        losses: entry.losses,
        winRate: decisive > 0 ? entry.gains / decisive : null,
      });
    }

    return {
      totalSessions,
      gainCount,
      decisiveCount,
      winRate,
      patternStats,
      totalSubSetups: allSubSetups.length,
    };
  });

  const [sorting, setSorting] = createSignal<SortingState>([]);

  const table = createSolidTable({
    get data() {
      return stats().patternStats;
    },
    columns,
    state: {
      get sorting() {
        return sorting();
      },
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <main class="flex flex-col gap-6 p-6 max-w-5xl mx-auto">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold">Statistics</h1>
        <A href="/lists" class={buttonVariants({ variant: "outline" })}>
          Patterns
        </A>
      </div>

      <div class="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader class="pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">
              Win Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">
              {stats().winRate !== null
                ? `${Math.round(stats().winRate! * 100)}%`
                : "—"}
            </div>
            <p class="text-xs text-muted-foreground mt-1">
              {stats().gainCount} gains / {stats().decisiveCount} decisive
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">
              Total Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{stats().totalSessions}</div>
            <p class="text-xs text-muted-foreground mt-1">trade session rows</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">
              Sub-setups
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{stats().totalSubSetups}</div>
            <p class="text-xs text-muted-foreground mt-1">setups analysed</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pattern Win Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <For each={table.getHeaderGroups()}>
                {(headerGroup) => (
                  <TableRow>
                    <For each={headerGroup.headers}>
                      {(header) => (
                        <TableHead
                          onClick={header.column.getToggleSortingHandler()}
                          class={
                            header.column.getCanSort()
                              ? "cursor-pointer select-none"
                              : ""
                          }
                        >
                          <div class="flex items-center gap-1">
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            <Show when={header.column.getCanSort()}>
                              <ArrowUpDown class="w-3 h-3 opacity-50" />
                            </Show>
                          </div>
                        </TableHead>
                      )}
                    </For>
                  </TableRow>
                )}
              </For>
            </TableHeader>
            <TableBody>
              <Show
                when={table.getRowModel().rows.length > 0}
                fallback={
                  <TableRow>
                    <TableCell
                      colspan={columns.length}
                      class="text-center text-muted-foreground py-8"
                    >
                      No pattern data yet.
                    </TableCell>
                  </TableRow>
                }
              >
                <For each={table.getRowModel().rows}>
                  {(row) => (
                    <TableRow>
                      <For each={row.getVisibleCells()}>
                        {(cell) => (
                          <TableCell>
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </TableCell>
                        )}
                      </For>
                    </TableRow>
                  )}
                </For>
              </Show>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
