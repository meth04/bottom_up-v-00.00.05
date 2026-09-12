// js/icons.js
//
// Hand-drawn & stylized SVG icon library for "bottom up".
// Replaces system emojis with unified, scale-independent vector icons
// rendered in the game's antique cartographic ink style.

const GAME_ICONS = {
  // Resources
  timbermellow: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2c.8 1.4 1.5 3.2 1.3 4.2-.6-.2-1.3-.2-1.8 0-.3-1-.1-2.8.5-4.2z" fill="#7a5528" stroke="#4a3014"/>
    <path d="M5.5 8.2c1.2-1.8 4-2.7 6.5-2.7s5.3.9 6.5 2.7c.4.6.2 1.4-.4 1.8-1.7 1.1-4.1 1.7-6.1 1.7s-4.4-.6-6.1-1.7c-.6-.4-.8-1.2-.4-1.8z" fill="#966a38" stroke="#4a3014"/>
    <path d="M6.2 9.5C6.5 15 9 21.5 12 22c3-.5 5.5-7 5.8-12.5" fill="#c48a47" stroke="#4a3014"/>
    <path d="M10 12.5c.5 2.5 1.2 5 2 7" stroke="#7a5528" stroke-width="1.2" stroke-linecap="round"/>
    <circle cx="10" cy="11.5" r="0.8" fill="#ffeed1" stroke="none"/>
  </svg>`,

  wood: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 14l11-6.5c1.4-.8 3.2-.3 4 1.1l1 1.7c.8 1.4.3 3.2-1.1 4L7.9 20.8c-1.4.8-3.2.3-4-1.1L2.9 18c-.8-1.4-.3-3.2 1.1-4z" fill="#b07e4c" stroke="#472d13"/>
    <ellipse cx="6" cy="17" rx="2.5" ry="3.8" transform="rotate(-30 6 17)" fill="#d9ad77" stroke="#472d13"/>
    <path d="M5.2 16.5c.3.5.8.8 1.4.6.6-.2.9-.8.7-1.4" stroke="#7a4f21" stroke-width="1.2"/>
    <path d="M10 10.5l8-4.7M13 15l6-3.5" stroke="#7a4f21" stroke-width="1.2"/>
    <path d="M6 7l11-4.5c1.2-.5 2.6 0 3.2 1.2l.5 1c.6 1.2.1 2.6-1.1 3.1L8.6 12.3" fill="#8f6338" stroke="#472d13"/>
  </svg>`,

  stone: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 14l4-8 8-2 5 6-3 9-10 2-4-7z" fill="#9e9e9e" stroke="#373737"/>
    <path d="M8 6l4 5 9-1" stroke="#373737" stroke-width="1.4"/>
    <path d="M12 11l-4 10" stroke="#373737" stroke-width="1.4"/>
    <path d="M12 11l6 6" stroke="#373737" stroke-width="1.4"/>
    <path d="M4 14l8-3" stroke="#373737" stroke-width="1.4"/>
    <polygon points="8,6 12,11 4,14" fill="#c4c4c4" opacity="0.6"/>
    <polygon points="12,11 16,4 21,10 18,17" fill="#7d7d7d" opacity="0.4"/>
  </svg>`,

  grain: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 22c3-6 7-12 14-16" stroke="#5a420b" stroke-width="1.8"/>
    <path d="M16 4c-1 2-1 4 1 5 2-1 2-3 1-5" fill="#f0ca4d" stroke="#5a420b"/>
    <path d="M13 6c-2 1-3 3-1 5 2 0 3-2 2-4" fill="#e6bd35" stroke="#5a420b"/>
    <path d="M18 8c0 2 1 4 3 4 1-2 0-4-2-4" fill="#f0ca4d" stroke="#5a420b"/>
    <path d="M11 10c-2 1-2 3 0 4 2 0 2-2 1-4" fill="#e6bd35" stroke="#5a420b"/>
    <path d="M15 11c0 2 1 4 3 3 0-2-1-3-2-3" fill="#f0ca4d" stroke="#5a420b"/>
    <path d="M9 14c-1 1-1 3 1 4 1 0 2-2 0-3" fill="#dfb326" stroke="#5a420b"/>
    <path d="M13 15c0 2 1 3 2 3 0-2-1-3-1-3" fill="#dfb326" stroke="#5a420b"/>
  </svg>`,

  hours: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 3h12M6 21h12" stroke="#5a4316" stroke-width="2.2"/>
    <path d="M7 3v3c0 2.8 1.8 5.2 4.4 5.9L12 12l.6-.1C15.2 11.2 17 8.8 17 6V3" fill="#f4e4bc" stroke="#5a4316"/>
    <path d="M7 21v-3c0-2.8 1.8-5.2 4.4-5.9L12 12l.6.1c2.6.7 4.4 3.1 4.4 5.9v3" fill="#f4e4bc" stroke="#5a4316"/>
    <path d="M9 19c.8-1.5 2.2-2 3-2s2.2.5 3 2H9z" fill="#d4a342" stroke="none"/>
    <path d="M10 6.5h4l-1 2.5h-2z" fill="#d4a342" stroke="none"/>
    <line x1="12" y1="12" x2="12" y2="16" stroke="#d4a342" stroke-width="1" stroke-dasharray="1 1"/>
  </svg>`,

  villager: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="7.5" r="4" fill="#e8ba8b" stroke="#422c15"/>
    <path d="M8 8.5c0-3.5 2-5 4.5-5 3 0 4.5 1.5 4.5 4 0 .5-1.5 1-2.5.5-1-.5-2 .5-3.5 0-.8-.3-2.2-.2-3 .5z" fill="#8d5b32" stroke="#422c15" stroke-width="1.3"/>
    <path d="M5 21v-2c0-3.3 3.1-6 7-6s7 2.7 7 6v2" fill="#4d7c52" stroke="#254429"/>
    <path d="M9.5 13.5L12 16.5l2.5-3" stroke="#e8ba8b" stroke-width="1.4"/>
  </svg>`,

  soldier: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3c-4 0-7 2.5-7 6.5v4c0 4 3 8 7 9.5 4-1.5 7-5.5 7-9.5v-4c0-4-3-6.5-7-6.5z" fill="#4b5d78" stroke="#1f2c3d"/>
    <path d="M12 4.5v16" stroke="#cbb26b" stroke-width="1.5"/>
    <path d="M6.5 10.5h11" stroke="#cbb26b" stroke-width="1.5"/>
    <circle cx="12" cy="10.5" r="2" fill="#cbb26b" stroke="#7e6524"/>
    <path d="M9 13.5l3 3 3-3" stroke="#cbb26b" stroke-width="1.3"/>
  </svg>`,

  barn: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 11l9-8 9 8v10H3V11z" fill="#a44c3c" stroke="#461d15"/>
    <path d="M1 11.5l11-9.5 11 9.5" stroke="#461d15" stroke-width="2.2"/>
    <rect x="8" y="13" width="8" height="8" fill="#582a20" stroke="#33120b"/>
    <line x1="8" y1="13" x2="16" y2="21" stroke="#a44c3c" stroke-width="1.2"/>
    <line x1="16" y1="13" x2="8" y2="21" stroke="#a44c3c" stroke-width="1.2"/>
    <polygon points="12,5 10,8 14,8" fill="#f0d59e" stroke="#461d15"/>
  </svg>`,

  house: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 11.5L12 4l8 7.5V21H4V11.5z" fill="#dfcfad" stroke="#4a3b25"/>
    <path d="M2.5 12L12 3l9.5 9" stroke="#7a3424" stroke-width="2.2"/>
    <path d="M16 4v3.5l2 1.5V4h-2z" fill="#803525" stroke="#4a1c12"/>
    <rect x="10" y="14" width="4" height="7" fill="#66462c" stroke="#382211"/>
    <rect x="6" y="13" width="2.8" height="3" fill="#75a5b5" stroke="#382211"/>
  </svg>`,

  tiles: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="12,2 21,7.2 21,16.8 12,22 3,16.8 3,7.2" fill="#dfcca4" stroke="#544026"/>
    <polygon points="12,5.5 18,9 18,15 12,18.5 6,15 6,9" fill="#c7b084" stroke="#544026" stroke-dasharray="2 2"/>
    <circle cx="12" cy="12" r="1.5" fill="#844a2b" stroke="none"/>
  </svg>`,

  explore: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="9" fill="#f4ecd8" stroke="#4c391b" stroke-width="2"/>
    <polygon points="12,5 14.5,10.5 20,12 14.5,13.5 12,19 9.5,13.5 4,12 9.5,10.5" fill="#d9534f" stroke="#4c391b" stroke-width="1.2"/>
    <polygon points="12,5 14.5,10.5 12,12 9.5,10.5" fill="#b52b27"/>
    <polygon points="12,19 14.5,13.5 12,12 9.5,13.5" fill="#335c8d"/>
    <circle cx="12" cy="12" r="1.6" fill="#f4ecd8" stroke="#4c391b"/>
  </svg>`,

  seize: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 19l4-4M19 5l-8.5 8.5M14 4l6 6M18.5 5.5l-2 2" stroke="#444" stroke-width="1.8"/>
    <path d="M19 19l-4-4M5 5l8.5 8.5M10 4L4 10M5.5 5.5l2 2" stroke="#b83828" stroke-width="1.8"/>
    <circle cx="12" cy="12" r="2" fill="#e8c257" stroke="#444" stroke-width="1.2"/>
  </svg>`,

  center: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="11" r="7" fill="#e3f0f7" stroke="#334d5c" stroke-width="2"/>
    <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="#334d5c" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="11" cy="11" r="3" stroke="#8cbcd6" stroke-width="1.2" stroke-dasharray="2 2"/>
    <line x1="11" y1="6" x2="11" y2="8" stroke="#334d5c" stroke-width="1.5"/>
    <line x1="11" y1="14" x2="11" y2="16" stroke="#334d5c" stroke-width="1.5"/>
    <line x1="6" y1="11" x2="8" y2="11" stroke="#334d5c" stroke-width="1.5"/>
    <line x1="14" y1="11" x2="16" y2="11" stroke="#334d5c" stroke-width="1.5"/>
  </svg>`,

  // Techs
  stoneaxe: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 21l8-14" stroke="#6d4c2b" stroke-width="2.6"/>
    <path d="M11 6l3-3 6 2-2 7-6 1-1-7z" fill="#9e9e9e" stroke="#333"/>
    <path d="M12 9l3-3M13 11l4-4" stroke="#cda260" stroke-width="1.3"/>
  </svg>`,

  foodbasket: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 11h14l-2 10H7L5 11z" fill="#c49758" stroke="#4a3014"/>
    <path d="M8 11c0-4 1.8-7 4-7s4 3 4 7" stroke="#4a3014" stroke-width="2"/>
    <line x1="5" y1="15" x2="19" y2="15" stroke="#775127" stroke-width="1.4"/>
    <line x1="6" y1="18" x2="18" y2="18" stroke="#775127" stroke-width="1.4"/>
    <circle cx="10" cy="10" r="1.5" fill="#be4231" stroke="none"/>
    <circle cx="14" cy="10" r="1.5" fill="#4d8b37" stroke="none"/>
    <circle cx="12" cy="8.5" r="1.5" fill="#d8962f" stroke="none"/>
  </svg>`,

  farming: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 21L17 5" stroke="#704b27" stroke-width="2.4"/>
    <path d="M17 5c2-2 5-1 5 1 0 4-4 8-10 9" fill="#d9d9d9" stroke="#333" stroke-width="1.6"/>
    <path d="M11 11l-3 3" stroke="#704b27" stroke-width="2"/>
  </svg>`,

  mapmaking: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z" fill="#eeddb8" stroke="#4b391e"/>
    <line x1="9" y1="3" x2="9" y2="18" stroke="#4b391e" stroke-width="1.4" stroke-dasharray="2 2"/>
    <line x1="15" y1="6" x2="15" y2="21" stroke="#4b391e" stroke-width="1.4" stroke-dasharray="2 2"/>
    <circle cx="12" cy="11" r="2" fill="#b94332" stroke="#4b391e" stroke-width="1"/>
  </svg>`,

  tech: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 4h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="#f7ecd0" stroke="#523e1b"/>
    <path d="M7 8h8M7 12h8M7 16h5" stroke="#7d6438" stroke-width="1.4" stroke-linecap="round"/>
    <circle cx="16" cy="16" r="2.5" fill="#b83b2a" stroke="#4d120a"/>
  </svg>`,

  // Seasons
  spring: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 22v-9" stroke="#467833" stroke-width="2"/>
    <path d="M12 13c-4-4-5-8 0-11 5 3 4 7 0 11z" fill="#75bf4b" stroke="#336122"/>
    <path d="M12 17c3-2 5-2 7 0-1-3-3-4-7-2z" fill="#8dd962" stroke="#336122"/>
  </svg>`,

  summer: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="5" fill="#f5c742" stroke="#87580d" stroke-width="2"/>
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2M4.9 19.1l2.2-2.2M16.9 7.1l2.2-2.2" stroke="#c97c14" stroke-width="2"/>
  </svg>`,

  autumn: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 22V14" stroke="#683416" stroke-width="2"/>
    <path d="M12 14c-5-2-7-6-4-11 4 0 7 2 8 6 2-3 4-3 5-1-1 3-3 5-5 5l2 2-3 1-3-2z" fill="#e07b39" stroke="#683416"/>
  </svg>`,

  winter: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M4.9 19.1L19.1 4.9" stroke="#5b92b6" stroke-width="2"/>
    <circle cx="12" cy="12" r="2.5" fill="#dcf1fb" stroke="#396a8b"/>
    <path d="M10 4l2 2 2-2M10 20l2-2 2 2M4 10l2 2-2 2M20 10l-2 2 2 2" stroke="#5b92b6" stroke-width="1.4"/>
  </svg>`,

  // Alerts & status
  warn: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2L2 20h20L12 2z" fill="#e89d2c" stroke="#543003"/>
    <line x1="12" y1="9" x2="12" y2="14" stroke="#2b1501" stroke-width="2.2"/>
    <circle cx="12" cy="17.2" r="1.2" fill="#2b1501" stroke="none"/>
  </svg>`,

  danger: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2L2 20h20L12 2z" fill="#c93828" stroke="#4a0f08"/>
    <line x1="12" y1="9" x2="12" y2="14" stroke="#fff" stroke-width="2.2"/>
    <circle cx="12" cy="17.2" r="1.2" fill="#fff" stroke="none"/>
  </svg>`,

  info: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="9" fill="#4d86b8" stroke="#1c3e5e"/>
    <line x1="12" y1="11" x2="12" y2="17" stroke="#fff" stroke-width="2.2"/>
    <circle cx="12" cy="7.5" r="1.3" fill="#fff" stroke="none"/>
  </svg>`,

  hungry: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="9" fill="#c93828" stroke="#4a0f08"/>
    <path d="M8 15s1.5-2 4-2 4 2 4 2" stroke="#fff" stroke-width="2"/>
    <circle cx="9" cy="9.5" r="1.2" fill="#fff" stroke="none"/>
    <circle cx="15" cy="9.5" r="1.2" fill="#fff" stroke="none"/>
  </svg>`,

  roofless: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 10l9-7 9 7" stroke="#336699" stroke-width="2.2" stroke-linecap="round"/>
    <line x1="8" y1="13" x2="8" y2="19" stroke="#4a8bc2" stroke-width="1.8" stroke-dasharray="2 3"/>
    <line x1="12" y1="11" x2="12" y2="21" stroke="#4a8bc2" stroke-width="1.8" stroke-dasharray="2 3"/>
    <line x1="16" y1="13" x2="16" y2="19" stroke="#4a8bc2" stroke-width="1.8" stroke-dasharray="2 3"/>
  </svg>`,

  history: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="9" fill="#edd9b6" stroke="#422f16"/>
    <polyline points="12,7 12,12 15.5,14.5" stroke="#422f16" stroke-width="2"/>
    <path d="M4 12a8 8 0 0 1 8-8" stroke="#885b24" stroke-width="1.5" stroke-dasharray="2 2"/>
  </svg>`,

  settings: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3" fill="#cfba93" stroke="#422f16"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" fill="#cfba93" stroke="#422f16"/>
  </svg>`,

  book: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="#422f16" stroke-width="2"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" fill="#994132" stroke="#422f16"/>
    <path d="M8 7h8M8 11h6" stroke="#eed8b2" stroke-width="1.5"/>
  </svg>`,

  shield: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z"/>
    <path d="M12 3v18"/>
    <path d="M5 11h14"/>
  </svg>`,
  tower: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 21V9h8v12"/>
    <path d="M6 9V5h3v2h2V5h2v2h2V5h3v4"/>
    <path d="M11 21v-4h2v4"/>
  </svg>`,
  raid: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 20l7-7"/><path d="M14 4l6 6"/><path d="M13 5l6 6"/>
    <path d="M20 20l-7-7"/><path d="M10 4l-6 6"/><path d="M11 5l-6 6"/>
    <path d="M9 9l6 6"/>
  </svg>`,
  close: `<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`,
};

// Map old emoji strings to modern SVG icon keys
const EMOJI_TO_ICON_KEY = {
  "🌰": "timbermellow",
  "🪵": "wood",
  "🪨": "stone",
  "🌾": "grain",
  "⏱": "hours",
  "👤": "villager",
  "🛡": "soldier",
  "🏚": "barn",
  "🏠": "house",
  "⬡": "tiles",
  "🚩": "explore",
  "🔍": "center",
  "🪓": "stoneaxe",
  "🧺": "foodbasket",
  "🗺": "mapmaking",
  "💡": "tech",
  "🏺": "wood",
  "⛏️": "stone",
  "⚔️": "seize",
};

/**
 * Returns an SVG icon markup string.
 * @param {string} name - Icon key in GAME_ICONS or an emoji
 * @param {string} [extraClass=""] - Optional extra CSS class
 * @returns {string} SVG HTML string
 */
function getIcon(name, extraClass = "") {
  const key = EMOJI_TO_ICON_KEY[name] || name;
  const svg = GAME_ICONS[key];
  if (!svg) return name; // fallback to text if not found
  if (!extraClass) return svg;
  return svg.replace('class="game-icon"', `class="game-icon ${extraClass}"`);
}

/**
 * Replaces text emoji content in an element with an SVG icon
 * @param {HTMLElement} el
 * @param {string} iconKey
 */
function setElementIcon(el, iconKey) {
  if (!el) return;
  el.innerHTML = getIcon(iconKey);
}
