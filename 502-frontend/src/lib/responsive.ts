// Table columns shown only when the page area (@container/main) is wide
// enough, so tables fit a phone without scrolling sideways. The essential
// columns always show; the details are in the row's sheet or dialog.
export const SHOW_FROM = {
  xs: "hidden @sm/main:table-cell",
  sm: "hidden @xl/main:table-cell",
  md: "hidden @3xl/main:table-cell",
  lg: "hidden @5xl/main:table-cell",
} as const;

// Inline stand-in for the SHOW_FROM.sm columns while they are hidden.
export const ONLY_NARROW = "@xl/main:hidden";
