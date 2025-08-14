import { Component } from "solid-js";

export const IconBold: Component<{ class?: string }> = (props) => (
  <span class={`font-bold ${props.class || ""}`}>B</span>
);

export const IconItalic: Component<{ class?: string }> = (props) => (
  <span class={`italic ${props.class || ""}`}>I</span>
);

export const IconUnderline: Component<{ class?: string }> = (props) => (
  <span class={`underline ${props.class || ""}`}>U</span>
);

export const IconColor: Component<{ class?: string }> = (props) => (
  <span class={`${props.class || ""}`}>🎨</span>
);
