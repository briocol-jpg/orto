// =============================================================================
// Icone disegnate degli ortaggi che non hanno un'emoji adatta (o che hanno
// un'emoji troppo nuova: su telefoni e iPad meno recenti 🫛 e 🪻 si vedono come
// un quadratino a righe). Disegni semplici in un quadrato 32×32: si vedono
// uguali su tutti i telefoni. Gli ortaggi senza disegno usano l'emoji di data.js.
// =============================================================================

const ICONE = {
  mandarino: `
    <path d="M16 6c2-3 6-4 9-3-1 3-5 5-9 4z" fill="#3f8f2a"/>
    <ellipse cx="16" cy="19" rx="12" ry="10" fill="#f28a1c"/>
    <ellipse cx="12" cy="15" rx="3.5" ry="2" fill="#f9b25a"/>
    <path d="M16 9v3" stroke="#6b4a1f" stroke-width="1.6" stroke-linecap="round"/>`,
  kumquat: `
    <ellipse cx="11" cy="18" rx="6" ry="8.5" fill="#f5940f" transform="rotate(-15 11 18)"/>
    <ellipse cx="21.5" cy="17" rx="6" ry="8.5" fill="#f7a524" transform="rotate(15 21.5 17)"/>
    <path d="M14 6c3-4 8-4 10-2-2 3-6 4-10 2z" fill="#3f8f2a"/>
    <ellipse cx="9.5" cy="14" rx="1.6" ry="2.6" fill="#fbc76b"/>`,
  bergamotto: `
    <path d="M17 5c2-3 7-3 9-1-2 3-6 4-9 1z" fill="#3f8f2a"/>
    <circle cx="16" cy="18" r="11" fill="#c9cf3a"/>
    <path d="M6 20a10 10 0 0 0 20 0" fill="#e2cf2e"/>
    <ellipse cx="12" cy="13.5" rx="3.2" ry="2" fill="#e6ea8a"/>`,
  lime: `
    <path d="M17 6c2-3 7-3 9-1-2 3-6 4-9 1z" fill="#2d6a1f"/>
    <ellipse cx="16" cy="18" rx="12" ry="9.5" fill="#6dbb2f"/>
    <ellipse cx="11.5" cy="14.5" rx="3.5" ry="2" fill="#a8dd6e"/>
    <circle cx="27.5" cy="18" r="1.2" fill="#3f8f2a"/>`,
  calamondino: `
    <path d="M6 9c5-5 14-6 20-3-5 3-13 5-20 3z" fill="#3f8f2a"/>
    <circle cx="9" cy="17" r="5" fill="#f28a1c"/><circle cx="20" cy="15" r="5" fill="#f5960f"/>
    <circle cx="15" cy="24" r="5" fill="#ef7d12"/>
    <circle cx="7.5" cy="15.5" r="1.3" fill="#f9b25a"/><circle cx="18.5" cy="13.5" r="1.3" fill="#f9b25a"/>`,
  pompelmo: `
    <circle cx="16" cy="17" r="13" fill="#f3c34a"/>
    <path d="M5 21a12 12 0 0 0 22 0z" fill="#f0a24a"/>
    <ellipse cx="11" cy="11.5" rx="4" ry="2.4" fill="#f8de8c"/>
    <path d="M16 4v3" stroke="#6b4a1f" stroke-width="1.6" stroke-linecap="round"/>`,
  cedro: `
    <path d="M6 18c0-8 6-13 11-13s10 4 10 11c0 8-6 13-11 13S6 25 6 18z" fill="#f2d42c"/>
    <path d="M9 13c1 0 1 2 2 2M13 9c1 1 0 2 1 3M20 9c0 1 1 2 2 2M22 17c-1 1 0 2-1 3M12 22c1-1 2 0 3-1M17 25c0-1 1-2 2-2" stroke="#d4b414" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <path d="M17 5c1-3 5-4 8-3-1 3-4 4-8 3z" fill="#3f8f2a"/>`,
  chinotto: `
    <path d="M4 12c6-7 18-8 24-4-6 4-17 6-24 4z" fill="#2d6a1f"/>
    <circle cx="10" cy="20" r="6" fill="#e36d10"/><circle cx="22" cy="20" r="6" fill="#d8620c"/>
    <circle cx="8.5" cy="18" r="1.5" fill="#f3a04a"/><circle cx="20.5" cy="18" r="1.5" fill="#f3a04a"/>`,
  canapa: `
    <path d="M16 30V14" stroke="#3d7a26" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M16 16C15 10 15 5 16 2c1 3 1 8 0 14z" fill="#4f9a2f"/>
    <path d="M16 16c-3-4-6-7-9-8 1 3 4 6 9 8z" fill="#4f9a2f"/><path d="M16 16c3-4 6-7 9-8-1 3-4 6-9 8z" fill="#4f9a2f"/>
    <path d="M16 17c-4-1-8-1-11 1 3 1 7 1 11-1z" fill="#5fae3a"/><path d="M16 17c4-1 8-1 11 1-3 1-7 1-11-1z" fill="#5fae3a"/>
    <path d="M16 18c-2 1-4 3-5 5 2-1 4-3 5-5zM16 18c2 1 4 3 5 5-2-1-4-3-5-5z" fill="#3d8a26"/>`,
  pisello: `
    <path d="M2 21C7 9 21 4 30 7c-3 11-15 19-28 14z" fill="#5fae3a"/>
    <path d="M5 19.5C11 13 20 9 27 9c-4 8-13 13-22 10.5z" fill="#3d8a26"/>
    <circle cx="9" cy="17.4" r="2.7" fill="#a6e05f"/><circle cx="14" cy="15" r="2.9" fill="#a6e05f"/>
    <circle cx="19.2" cy="12.9" r="2.9" fill="#a6e05f"/><circle cx="24" cy="11.2" r="2.4" fill="#a6e05f"/>
    <path d="M29.5 7.5l1.5-4" stroke="#3d8a26" stroke-width="1.6" stroke-linecap="round"/>`,
  fagiolino: `
    <path d="M5 3c-3 9 1 19 8 26 1.5 1.2 3.6-.4 2.6-2C10 20 8 12 9.4 3z" fill="#5aa83a"/>
    <path d="M16 2c-2.5 9 1.5 19 8.5 25.5 1.5 1.2 3.5-.6 2.5-2.2C21.5 19 18.5 11 20.4 2z" fill="#3f8f2a"/>
    <path d="M7.2 3V1M18.2 2V.5" stroke="#2d6a1f" stroke-width="1.8" stroke-linecap="round"/>`,
  fagiolo: `
    <path d="M4 12c0-5 6-7 10-5 2 1 2 3 4 3 3 0 4 4 1 7-4 4-15 3-15-5z" fill="#f1e3c8"/>
    <path d="M7 9c2 2 5 7 4 10M11 8c1 3 4 6 7 8" stroke="#b5463a" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <path d="M14 22c0-4 5-6 8-4 2 1 2 2 4 2 3 1 3 5 0 7-4 3-12 2-12-5z" fill="#9b2f2a"/>
    <path d="M17 21c2-1 4 0 5 1" stroke="#d2645b" stroke-width="1.2" fill="none" stroke-linecap="round"/>`,
  fava: `
    <path d="M3 24C5 12 17 4 29 4c1 10-10 22-26 20z" fill="#3e7f2c"/>
    <path d="M6 22c2-8 11-14 20-15-1 7-9 15-20 15z" fill="#f4f6e8"/>
    <ellipse cx="10.5" cy="18.5" rx="3.6" ry="2.8" fill="#b5dc8a" transform="rotate(-35 10.5 18.5)"/>
    <ellipse cx="16" cy="14" rx="3.6" ry="2.8" fill="#b5dc8a" transform="rotate(-35 16 14)"/>
    <ellipse cx="21.5" cy="10" rx="3.3" ry="2.6" fill="#b5dc8a" transform="rotate(-35 21.5 10)"/>`,
  spinacio: `
    <path d="M16 30V18M16 22l-6-5M16 22l6-5" stroke="#7aa84f" stroke-width="1.6" stroke-linecap="round"/>
    <ellipse cx="16" cy="10" rx="5.5" ry="8.5" fill="#1f6b2a"/>
    <ellipse cx="7.5" cy="13" rx="4.5" ry="7" fill="#2a7d32" transform="rotate(-35 7.5 13)"/>
    <ellipse cx="24.5" cy="13" rx="4.5" ry="7" fill="#2a7d32" transform="rotate(35 24.5 13)"/>
    <path d="M16 4v12M7 8l3 8M25 8l-3 8" stroke="#6fae5f" stroke-width="1" stroke-linecap="round"/>`,
  rucola: `
    <path d="M16 31V5" stroke="#5c8f3a" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M16 3c4 1 4 5 1 6 5 0 6 4 2 6 5 0 6 5 1 6 4 1 3 5-1 5h-3V3z" fill="#3c8a2e"/>
    <path d="M16 3c-4 1-4 5-1 6-5 0-6 4-2 6-5 0-6 5-1 6-4 1-3 5 1 5h3V3z" fill="#4a9c36"/>
    <path d="M16 5v21" stroke="#cfe6b0" stroke-width="1.1" stroke-linecap="round"/>`,
  prezzemolo: `
    <path d="M16 31l-1-12M15 19l-6-6M15 19l7-7M15 19v-8" stroke="#4f8f2f" stroke-width="1.4" stroke-linecap="round" fill="none"/>
    <g fill="#2f7d25">
      <path d="M9 13l-4-1-1-4 3-2 1-3 4 1 2 3-1 3 1 3z"/>
      <path d="M22 12l4-1 1-4-3-2-1-3-4 1-2 3 1 3-1 3z"/>
      <path d="M15 11l-3-2v-4l3-3 3 3v4z"/>
    </g>
    <path d="M8 10l-2-3M23 9l2-3M15 9V4" stroke="#6fb84a" stroke-width=".9" stroke-linecap="round"/>`,
  finocchio: `
    <path d="M12 16l-2-8M16 15V5M20 16l2-8" stroke="#8cc153" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M10 8l-3-4M10 8l-1-5M10 8l1-5M16 5l-2-4M16 5l2-4M16 5V1M22 8l1-5M22 8l3-4M22 8l-1-5" stroke="#5aa83a" stroke-width="1" stroke-linecap="round"/>
    <path d="M8 29c-4-5-2-12 4-14h8c6 2 8 9 4 14z" fill="#f3f5e2" stroke="#bfd48f" stroke-width="1"/>
    <path d="M12 16c-2 4-2 9 0 13M20 16c2 4 2 9 0 13M16 15v14" stroke="#d3e0b0" stroke-width="1" fill="none"/>`,
  sedano: `
    <path d="M11 30l1-20M16 30V9M21 30l-1-20" stroke="#a9d27a" stroke-width="4" stroke-linecap="round"/>
    <path d="M11 30l1-20M16 30V9M21 30l-1-20" stroke="#cfe7a6" stroke-width="1.2" stroke-linecap="round"/>
    <g fill="#4f9a2f"><circle cx="11" cy="7" r="3.5"/><circle cx="16" cy="5" r="3.8"/><circle cx="21" cy="7" r="3.5"/><circle cx="8" cy="10" r="2.5"/><circle cx="24" cy="10" r="2.5"/></g>`,
  porro: `
    <path d="M14 12C10 9 6 4 5 1c5 2 9 6 10 10zM18 12c4-3 8-8 9-11-5 2-9 6-10 10z" fill="#2f6f3a"/>
    <path d="M15 12c-1-4 0-8 1-11 1 3 2 7 1 11z" fill="#3f8a46"/>
    <rect x="13" y="11" width="6" height="11" fill="#b9d98a"/>
    <rect x="13" y="20" width="6" height="8" rx="2" fill="#f5f7ea" stroke="#d9e2c0" stroke-width=".8"/>
    <path d="M14 28l-1.5 3M16 28v3.5M18 28l1.5 3" stroke="#c9b48f" stroke-width="1" stroke-linecap="round"/>`,
  ravanello: `
    <path d="M15 12L9 3M16 12V2M17 12l6-9" stroke="#4f8f2f" stroke-width="1.5" stroke-linecap="round"/>
    <ellipse cx="9" cy="5" rx="3" ry="4.5" fill="#4a9c36" transform="rotate(-35 9 5)"/>
    <ellipse cx="23" cy="5" rx="3" ry="4.5" fill="#4a9c36" transform="rotate(35 23 5)"/>
    <circle cx="16" cy="19" r="8" fill="#d6304a"/>
    <path d="M13 26c1 2 2 3 3 5 1-2 2-3 3-5z" fill="#f4eee6"/>
    <ellipse cx="13" cy="16" rx="2" ry="3" fill="#ee6f80"/>`,
  basilico: `
    <path d="M16 31V14" stroke="#4f8f2f" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M16 15C8 17 3 12 4 5c6-1 11 3 12 10z" fill="#3fae3a"/>
    <path d="M16 15c8 2 13-3 12-10-6-1-11 3-12 10z" fill="#36a032"/>
    <path d="M16 13c-3-4-3-8 0-12 3 4 3 8 0 12z" fill="#58c24a"/>
    <path d="M16 15L6 6M16 15l10-9M16 12V3" stroke="#a5e08a" stroke-width=".9" stroke-linecap="round"/>`,
  valerianella: `
    <g fill="#3f8f2f">
      <ellipse cx="16" cy="8" rx="4" ry="6.5"/><ellipse cx="16" cy="24" rx="4" ry="6.5"/>
      <ellipse cx="8" cy="16" rx="6.5" ry="4"/><ellipse cx="24" cy="16" rx="6.5" ry="4"/>
    </g>
    <g fill="#55a83f">
      <ellipse cx="10" cy="10" rx="3.5" ry="5.5" transform="rotate(-45 10 10)"/><ellipse cx="22" cy="10" rx="3.5" ry="5.5" transform="rotate(45 22 10)"/>
      <ellipse cx="10" cy="22" rx="3.5" ry="5.5" transform="rotate(45 10 22)"/><ellipse cx="22" cy="22" rx="3.5" ry="5.5" transform="rotate(-45 22 22)"/>
    </g>
    <circle cx="16" cy="16" r="2.5" fill="#cfe6a0"/>`,
  asparago: `
    <path d="M10 30l1-22M16 30V5M22 30l-1-22" stroke="#6aa83e" stroke-width="3.6" stroke-linecap="round"/>
    <path d="M11 9l-1-4 1-3 1.5 3zM16 6l-1.2-4L16 0l1.2 2zM21 9l-.5-4L22 2l.6 3z" fill="#7a4a8f"/>
    <path d="M9.5 15l2 1M15 13l2 1M20.5 15l2 1M10 22l2 1M15 21l2 1M20 22l2 1" stroke="#4a7d2a" stroke-width="1" stroke-linecap="round"/>
    <rect x="8" y="24" width="16" height="2.5" rx="1" fill="#c9764a"/>`,
  carciofo: `
    <path d="M16 31v-6" stroke="#6b8f3f" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M6 18c0-7 4-14 10-15 6 1 10 8 10 15-3 5-17 5-20 0z" fill="#6a9a4a"/>
    <path d="M7 19c2-5 5-8 9-8s7 3 9 8c-4 6-14 6-18 0z" fill="#5a8a3e"/>
    <path d="M9 22c2-4 4-6 7-6s5 2 7 6c-3 4-11 4-14 0z" fill="#4b7a34"/>
    <path d="M16 3c-2 3-2 6 0 8 2-2 2-5 0-8zM8 12c1 2 3 3 5 3M24 12c-1 2-3 3-5 3" stroke="#8a5a9a" stroke-width="1.3" fill="#8a5a9a" stroke-linecap="round"/>`,
  rosmarino: `
    <path d="M6 30L26 3" stroke="#6b5a3a" stroke-width="1.6" stroke-linecap="round"/>
    <g stroke="#3f6f4a" stroke-width="2.3" stroke-linecap="round">
      <path d="M8 27l-4-2M9 26l3 3M11 23l-4-2M12 22l3 3M14 19l-4-2M15 18l3 3M17 15l-4-2M18 14l3 3M20 11l-4-2M21 10l3 3M23 7l-4-2M24 6l3 3"/>
    </g>`,
  salvia: `
    <path d="M16 31V12" stroke="#6f8a5f" stroke-width="1.6" stroke-linecap="round"/>
    <ellipse cx="16" cy="9" rx="5" ry="8.5" fill="#8fae8a"/>
    <ellipse cx="9" cy="17" rx="4" ry="7" fill="#7fa07a" transform="rotate(-50 9 17)"/>
    <ellipse cx="23" cy="17" rx="4" ry="7" fill="#7fa07a" transform="rotate(50 23 17)"/>
    <path d="M16 3v13M13 7l3 2 3-2M13 11l3 2 3-2M4 13l10 7M28 13l-10 7" stroke="#c4d6be" stroke-width=".8" fill="none" stroke-linecap="round"/>`,
  rafano: `
    <path d="M14 13C8 11 4 6 5 1c5 1 9 5 10 10zM17 13c5-3 9-7 9-12-5 0-9 5-10 10z" fill="#3f8f2f"/>
    <path d="M12 13h8l-2 17c-1 2-3 2-4 0z" fill="#efe6d2" stroke="#cdbf9e" stroke-width=".9"/>
    <path d="M13.5 17h3M14 21h3M14.5 25h2.5" stroke="#cdbf9e" stroke-width=".9" stroke-linecap="round"/>`,
  menta: `
    <path d="M16 31V4" stroke="#4a8a3a" stroke-width="1.5" stroke-linecap="round"/>
    <g fill="#4cbf5a">
      <path d="M16 22c-6 1-10-2-11-6 5-2 9 0 11 6zM16 22c6 1 10-2 11-6-5-2-9 0-11 6z"/>
      <path d="M16 13c-5 1-8-2-9-5 4-2 8 0 9 5zM16 13c5 1 8-2 9-5-4-2-8 0-9 5z"/>
      <path d="M16 6c-2-1-3-3-2-5 2 0 3 2 2 5zM16 6c2-1 3-3 2-5-2 0-3 2-2 5z"/>
    </g>
    <path d="M7 16l9 6M25 16l-9 6M9 8l7 5M23 8l-7 5" stroke="#a8e5a0" stroke-width=".8" stroke-linecap="round"/>`,
  timo: `
    <path d="M16 31c0-8-1-16-5-26M16 31c1-7 4-14 9-21" stroke="#7a6a4a" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <g fill="#6f9a6a">
      <ellipse cx="12" cy="8" rx="1.3" ry="2"/><ellipse cx="10" cy="11" rx="2" ry="1.2"/><ellipse cx="14.5" cy="12" rx="2" ry="1.2"/>
      <ellipse cx="12" cy="16" rx="2" ry="1.2"/><ellipse cx="16.8" cy="17" rx="2" ry="1.2"/><ellipse cx="13.5" cy="21" rx="2" ry="1.2"/>
      <ellipse cx="18" cy="23" rx="2" ry="1.2"/><ellipse cx="24" cy="10" rx="1.3" ry="2"/><ellipse cx="21" cy="13" rx="2" ry="1.2"/>
      <ellipse cx="24.5" cy="15" rx="2" ry="1.2"/><ellipse cx="19" cy="18" rx="2" ry="1.2"/><ellipse cx="22" cy="20" rx="2" ry="1.2"/>
    </g>
    <circle cx="11" cy="5" r="1.4" fill="#c9a0d9"/><circle cx="25" cy="8" r="1.4" fill="#c9a0d9"/>`,
  origano: `
    <path d="M16 31V9M16 20l-7-6M16 16l7-6" stroke="#6a7a3a" stroke-width="1.3" stroke-linecap="round"/>
    <g fill="#5f9a45">
      <circle cx="12" cy="26" r="2.6"/><circle cx="20" cy="26" r="2.6"/><circle cx="12.5" cy="20.5" r="2.4"/><circle cx="19.5" cy="20.5" r="2.4"/>
      <circle cx="9" cy="14" r="2"/><circle cx="23" cy="10" r="2"/>
    </g>
    <g fill="#e08ab8"><circle cx="16" cy="6" r="2"/><circle cx="13" cy="8" r="1.6"/><circle cx="19" cy="8" r="1.6"/><circle cx="7.5" cy="11.5" r="1.5"/><circle cx="24.5" cy="7.5" r="1.5"/><circle cx="16" cy="3" r="1.4"/></g>`,
  maggiorana: `
    <path d="M16 31V10M16 22l-8-7M16 18l8-7" stroke="#7a7a5a" stroke-width="1.3" stroke-linecap="round"/>
    <g fill="#9ab08a"><ellipse cx="11.5" cy="26" rx="3" ry="2"/><ellipse cx="20.5" cy="26" rx="3" ry="2"/><ellipse cx="12" cy="21" rx="2.6" ry="1.8"/><ellipse cx="20" cy="21" rx="2.6" ry="1.8"/></g>
    <g fill="#dfe6c8" stroke="#9ab08a" stroke-width=".8"><circle cx="16" cy="7" r="3"/><circle cx="7.5" cy="13.5" r="2.4"/><circle cx="24.5" cy="9.5" r="2.4"/></g>`,
  melissa: `
    <path d="M16 31V15" stroke="#6a9a3a" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M16 16C9 18 4 13 5 7c3-1 5 0 6 2 1-3 4-3 5 0z" fill="#8ccf3f"/>
    <path d="M16 16c7 2 12-3 11-9-3-1-5 0-6 2-1-3-4-3-5 0z" fill="#7dc236"/>
    <path d="M16 14c-3-3-4-7-2-11 1-1 3-1 4 0 2 4 1 8-2 11z" fill="#9ad84a"/>
    <path d="M16 16L7 9M16 16l9-7M16 13V4M10 13l2-3M22 13l-2-3" stroke="#d6f0a8" stroke-width=".8" stroke-linecap="round"/>`,
  erbacipollina: `
    <g stroke="#3f8f3a" stroke-width="1.6" stroke-linecap="round">
      <path d="M10 31c0-8-1-15-3-22M13 31c0-9 0-16-1-25M16 31V9M19 31c0-9 0-16 1-25M22 31c0-8 1-15 3-22"/>
    </g>
    <circle cx="16" cy="6" r="4.5" fill="#b07ad0"/><circle cx="16" cy="6" r="2.2" fill="#cfa3e8"/>`,
  aneto: `
    <path d="M16 31V9" stroke="#5a9a3a" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M16 24l-8-5M16 24l8-5M16 18l-7-4M16 18l7-4M10 20l-3 0M10 20l-1 2M22 20l3 0M22 20l1 2M11 15l-3-1M21 15l3-1" stroke="#6fbf4a" stroke-width=".9" stroke-linecap="round"/>
    <path d="M16 9L9 4M16 9l-3-6M16 9V2M16 9l3-6M16 9l7-5" stroke="#9aa83a" stroke-width="1" stroke-linecap="round"/>
    <g fill="#f2c62a"><circle cx="9" cy="4" r="1.6"/><circle cx="13" cy="3" r="1.6"/><circle cx="16" cy="2" r="1.6"/><circle cx="19" cy="3" r="1.6"/><circle cx="23" cy="4" r="1.6"/></g>`,
  coriandolo: `
    <path d="M16 31V16M16 20l-6-5M16 20l6-5" stroke="#5a9a3a" stroke-width="1.4" stroke-linecap="round"/>
    <g fill="#4aa83a">
      <path d="M16 17c-4 0-6-3-5-6 1 0 2 1 2 2 0-3 1-5 3-6 2 1 3 3 3 6 0-1 1-2 2-2 1 3-1 6-5 6z"/>
      <path d="M9 16c-4 1-7-1-7-4 1-1 2 0 3 1-1-3 0-5 2-6 2 0 3 2 4 4 0-1 1-2 2-1 1 3-1 5-4 6z"/>
      <path d="M23 16c4 1 7-1 7-4-1-1-2 0-3 1 1-3 0-5-2-6-2 0-3 2-4 4 0-1-1-2-2-1-1 3 1 5 4 6z"/>
    </g>`,
  dragoncello: `
    <path d="M16 31V3" stroke="#5a8a3a" stroke-width="1.3" stroke-linecap="round"/>
    <g fill="#5f9a3f">
      <path d="M16 26C11 25 6 22 3 18c5 0 10 3 13 8zM16 26c5-1 10-4 13-8-5 0-10 3-13 8z"/>
      <path d="M16 18c-4-1-8-4-10-8 4 0 8 3 10 8zM16 18c4-1 8-4 10-8-4 0-8 3-10 8z"/>
      <path d="M16 10c-3-1-5-4-6-7 3 0 5 3 6 7zM16 10c3-1 5-4 6-7-3 0-5 3-6 7z"/>
    </g>`,
  alloro: `
    <path d="M5 29L25 8" stroke="#6b5a3a" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M25 8c-1-5 1-7 5-7 0 4-2 7-5 7z" fill="#2f5a2a"/>
    <path d="M17 16c-6-2-8-7-7-12 5 1 8 6 7 12z" fill="#2f6a33"/>
    <path d="M17 16c2 6 7 8 12 7-1-5-6-8-12-7z" fill="#3a7a3a"/>
    <path d="M10 23c-6-1-8-6-8-10 5 0 8 5 8 10z" fill="#2f6a33"/>
    <path d="M10 23c2 5 6 7 10 6-1-4-5-7-10-6z" fill="#3a7a3a"/>
    <path d="M17 16l-5-10M17 16l10 6M10 23l-6-8M10 23l8 5" stroke="#6fa86a" stroke-width=".8" stroke-linecap="round"/>`,
  lavanda: `
    <path d="M10 31l2-18M16 31V9M22 31l-2-18" stroke="#6a9a5a" stroke-width="1.3" stroke-linecap="round"/>
    <g fill="#8a63c9">
      <ellipse cx="12" cy="12" rx="2.3" ry="2.6"/><ellipse cx="12.4" cy="8" rx="2.1" ry="2.4"/><ellipse cx="12.8" cy="4.5" rx="1.8" ry="2.1"/>
      <ellipse cx="16" cy="9" rx="2.4" ry="2.7"/><ellipse cx="16" cy="5" rx="1.7" ry="2.3"/><ellipse cx="16" cy="1.8" rx="1.3" ry="1.6"/>
      <ellipse cx="20" cy="12" rx="2.3" ry="2.6"/><ellipse cx="19.6" cy="8" rx="2.1" ry="2.4"/><ellipse cx="19.2" cy="4.5" rx="1.8" ry="2.1"/>
    </g>`,
  bietola: `
    <path d="M16 31c0-6-1-12-2-18" stroke="#d23a4a" stroke-width="3" stroke-linecap="round"/>
    <path d="M14 14C7 13 4 7 6 2c4-1 9 0 11 3 4-2 9 0 10 4 1 6-6 7-13 5z" fill="#2f7a2a"/>
    <path d="M14 14c-1-4 0-8 2-11M14 10l-5-4M14 12l7-5M15 7l5-2" stroke="#d23a4a" stroke-width="1" fill="none" stroke-linecap="round"/>`,
  radicchio: `
    <circle cx="16" cy="17" r="12" fill="#8a1f3a"/>
    <path d="M16 6c-4 5-4 17 0 23M16 6c4 5 4 17 0 23M7 12c5 2 10 10 9 17M25 12c-5 2-10 10-9 17" stroke="#f3e6ea" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <path d="M6 20c2-9 8-13 10-14 2 1 8 5 10 14" stroke="#b03a58" stroke-width="1" fill="none"/>`,
  cicoria: `
    <g fill="#3f8a2f">
      <path d="M16 30C11 22 8 13 9 2l2 3 1-2 1 4 1-3 2 26z"/>
      <path d="M16 30c5-8 8-17 7-28l-2 3-1-2-1 4-1-3-2 26z"/>
    </g>
    <path d="M16 30C6 24 2 16 2 8l3 2v-3l3 4 1-2 7 21zM16 30c10-6 14-14 14-22l-3 2V7l-3 4-1-2-7 21z" fill="#57a83e"/>
    <path d="M16 30L11 6M16 30l5-24M16 30L5 11M16 30l11-19" stroke="#e8f2d8" stroke-width="1" stroke-linecap="round"/>`,
  cavolonero: `
    <path d="M16 30V12M16 30l-5-14M16 30l5-14" stroke="#6f8f7a" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M16 18C12 14 12 6 16 1c4 5 4 13 0 17z" fill="#24493a"/>
    <path d="M11 20C6 17 4 10 6 4c4 3 7 10 5 16z" fill="#2c5644"/>
    <path d="M21 20c5-3 7-10 5-16-4 3-7 10-5 16z" fill="#2c5644"/>
    <g fill="#4a7a62"><circle cx="16" cy="6" r="1"/><circle cx="16" cy="11" r="1"/><circle cx="8" cy="10" r="1"/><circle cx="9.5" cy="15" r="1"/><circle cx="24" cy="10" r="1"/><circle cx="22.5" cy="15" r="1"/></g>`,
  verza: `
    <circle cx="16" cy="17" r="13" fill="#5f9a5a"/>
    <path d="M5 13c4-4 8-5 11-5s7 1 11 5M4 19c5-5 9-6 12-6s7 1 12 6" stroke="#8cc08a" stroke-width="1.3" fill="none"/>
    <circle cx="16" cy="19" r="6" fill="#a9d29a"/>
    <path d="M16 13v12M12 15l4 4 4-4" stroke="#d9efce" stroke-width="1" fill="none" stroke-linecap="round"/>
    <g fill="#4a8045"><circle cx="9" cy="23" r=".9"/><circle cx="23" cy="23" r=".9"/><circle cx="11" cy="10" r=".9"/><circle cx="21" cy="10" r=".9"/></g>`,
  zucchino: `
    <path d="M4 26C9 18 18 10 26 7c2-1 3 1 2 3-4 7-12 15-21 19-2 1-4-1-3-3z" fill="#2f6a2a"/>
    <path d="M7 25c6-6 13-12 19-15M8 27c6-5 13-11 19-16" stroke="#6faa4a" stroke-width=".9" fill="none" stroke-linecap="round"/>
    <path d="M27 8c1-3 3-4 4-4" stroke="#7a8a3a" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M5 27c-2 0-4-2-4-4 0-1 1-1 2 0 0-2 1-3 2-3 1 1 1 2 1 3 1-1 2 0 2 1-1 2-2 3-3 3z" fill="#f2b42a"/>`,
};

// Icona di un ortaggio in HTML: il disegno se c'è, altrimenti l'emoji.
function icona(o) {
  if (!o) return "🌱";
  return ICONE[o.id] ? `<svg class="ico" viewBox="0 0 32 32" aria-hidden="true">${ICONE[o.id]}</svg>` : o.emoji;
}
// La stessa dentro un disegno SVG (pianta dell'orto), centrata in (x, y) e larga "lato".
function iconaSvg(o, x, y, lato) {
  if (o && ICONE[o.id]) return `<svg class="p-ico" x="${x - lato / 2}" y="${y - lato / 2}" width="${lato}" height="${lato}" viewBox="0 0 32 32">${ICONE[o.id]}</svg>`;
  return `<text class="p-emoji" x="${x}" y="${y}" font-size="${lato}" text-anchor="middle" dominant-baseline="central">${o?.emoji ?? "🌱"}</text>`;
}
