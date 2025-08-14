import type { JSX, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import * as DropdownMenuPrimitive from "@kobalte/core/dropdown-menu";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";

import { cn } from "~/lib/utils";

const dropdownMenuVariants = cva(
  "z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
  {
    variants: {
      variant: {
        default: "",
        outline: "border border-input bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const dropdownMenuItemVariants = cva(
  "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  {
    variants: {
      variant: {
        default: "",
        outline:
          "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

type DropdownMenuProps<T extends ValidComponent = "div"> =
  DropdownMenuPrimitive.DropdownMenuRootProps<T> &
    VariantProps<typeof dropdownMenuVariants> & {
      class?: string | undefined;
      children?: JSX.Element;
    };

type DropdownMenuTriggerProps<T extends ValidComponent = "button"> =
  DropdownMenuPrimitive.DropdownMenuTriggerProps<T> &
    VariantProps<typeof dropdownMenuVariants> & {
      class?: string | undefined;
      children?: JSX.Element;
    };

type DropdownMenuItemProps<T extends ValidComponent = "div"> =
  DropdownMenuPrimitive.DropdownMenuItemProps<T> &
    VariantProps<typeof dropdownMenuItemVariants> & {
      class?: string | undefined;
      children?: JSX.Element;
    };

const DropdownMenu = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, DropdownMenuProps<T>>
) => {
  const [local, rest] = splitProps(props as DropdownMenuProps, [
    "class",
    "children",
  ]);

  return (
    <DropdownMenuPrimitive.Root
      class={cn(dropdownMenuVariants(), local.class)}
      {...rest}
    >
      {local.children}
    </DropdownMenuPrimitive.Root>
  );
};

const DropdownMenuTrigger = <T extends ValidComponent = "button">(
  props: PolymorphicProps<T, DropdownMenuTriggerProps<T>>
) => {
  const [local, rest] = splitProps(props as DropdownMenuTriggerProps, [
    "class",
    "children",
  ]);

  return (
    <DropdownMenuPrimitive.Trigger
      class={cn(dropdownMenuVariants(), local.class)}
      {...rest}
    >
      {local.children}
    </DropdownMenuPrimitive.Trigger>
  );
};

const DropdownMenuItem = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, DropdownMenuItemProps<T>>
) => {
  const [local, rest] = splitProps(props as DropdownMenuItemProps, [
    "class",
    "children",
  ]);

  return (
    <DropdownMenuPrimitive.Item
      class={cn(dropdownMenuItemVariants(), local.class)}
      {...rest}
    >
      {local.children}
    </DropdownMenuPrimitive.Item>
  );
};

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuItem };
