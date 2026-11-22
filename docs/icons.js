const iconPaths = {
  layout:'<path d="m3 9 9-5 9 5-9 5zM3 14l9 5 9-5M3 18l9 5 9-5" transform="translate(0 -2)"/>',
  layers:'<path d="m3 8 9-5 9 5-9 5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  checklist:'<rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 5V3h6v2M8 13l2 2 5-5"/>',
  supplies:'<path d="m3 7 9-4 9 4v11l-9 4-9-4zM3 7l9 5 9-5M12 12v10M7.5 5l9 5"/>',
  save:'<path d="M6 18a5 5 0 0 1-1-9 7 7 0 0 1 13-1 5.1 5.1 0 0 1 1 10M8 15l3 3 5-6"/>',
  file:'<path d="M6 21V3h8l4 4v14zM14 3v5h4M9 13h6M9 17h6"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  chevronDown:'<path d="m6 9 6 6 6-6"/>',chevronRight:'<path d="m9 6 6 6-6 6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',fit:'<path d="M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6"/>',
  sliders:'<path d="M4 6h7m4 0h5M4 12h2m5 0h9M4 18h9m4 0h3"/><circle cx="13" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="15" cy="18" r="2"/>',
  ledger:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 3v18M11 8h6M11 12h6M11 16h4"/>',
  pointer:'<path d="m5 3 14 10-7 1-3 7z"/>',rotate:'<path d="M4 11a8 8 0 1 1 2 7M4 5v6h6"/>',
  move:'<path d="M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
  export:'<path d="M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5"/>',upload:'<path d="M12 15V3m-4 4 4-4 4 4M4 15v5h16v-5"/>',
  edit:'<path d="m4 16 11-11 4 4L8 20l-5 1zM13 7l4 4"/>',
  check:'<path d="m4 12 5 5L20 6"/>',refresh:'<path d="M4 10a8 8 0 0 1 14-4l2 2M20 3v5h-5M20 14a8 8 0 0 1-14 4l-2-2M4 21v-5h5"/>',
  home:'<path d="m2 11 10-8 10 8M5 9v12h14V9M10 21v-7h4v7"/>'
};
function icon(name) {
  return '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+(iconPaths[name]||'')+'</svg>';
}
