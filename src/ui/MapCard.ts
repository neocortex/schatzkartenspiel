/**
 * The treasure map card: an old torn parchment with a small island and a big
 * red X, hand-drawn as inline SVG and entirely without text. It is held up over
 * whatever scene is running and resolves when the player closes it with Space.
 */

import { Input } from "../core/Input";
import { audio } from "../audio/Audio";

/** Space does nothing this long, so a press meant for the last dialogue can't close the card unseen. */
const MIN_OPEN_MS = 400;
/** Matches the `map-card-out` animation in ui.css. */
const CLOSE_MS = 280;

const INK = "#3b2412";
const RED = "#d3191f";
const LEAF = "#6f8f3c";
const SERPENT = "#4f9c8c";

/** The sheet's outline: every corner chewed, two rips and two burnt holes (the filter makes the edge fray). */
const SHEET = `M46 62 120 38 205 52 290 30 372 44 430 28 468 66 497 34 590 42 680 26 770 48 850 30 945 56 972 130 955 215 978 300 958 385 974 470 950 560 966 640 880 672 790 654 700 676 612 660 560 682 524 630 490 672 400 660 300 680 210 658 120 676 40 644 58 560 30 470 52 380 28 290 50 200 30 120Z
  M893 262 916 256 928 274 914 292 894 286Z M84 452 100 448 108 460 98 472 83 468Z`;

const ISLAND = "M372 340C360 280 420 235 480 238 530 205 610 205 650 236 710 232 762 270 756 322 790 360 760 420 700 430 668 476 590 482 546 452 500 470 430 462 408 420 362 416 348 372 372 340Z";
/** A copy of the coast around the island's middle, for the water lines drawn around it. */
const coast = (scale: number) => `transform="translate(560 345) scale(${scale}) translate(-560 -345)"`;

const FILTERS = `
  <filter id="mc-paper" x="-4%" y="-4%" width="108%" height="108%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="4" seed="8" result="tear"/>
    <feDisplacementMap in="SourceGraphic" in2="tear" scale="24" xChannelSelector="R" yChannelSelector="G" result="sheet"/>
    <feTurbulence type="fractalNoise" baseFrequency=".006 .009" numOctaves="5" seed="21" result="age"/>
    <feColorMatrix in="age" type="matrix" values="0 0 0 0 .42  0 0 0 0 .25  0 0 0 0 .08  0 2.8 0 0 -1.15" result="ageTint"/>
    <feComposite in="ageTint" in2="sheet" operator="in" result="stains"/>
    <feTurbulence type="fractalNoise" baseFrequency=".9 .55" numOctaves="3" seed="4" result="fibre"/>
    <feColorMatrix in="fibre" type="matrix" values="0 0 0 0 .30  0 0 0 0 .18  0 0 0 0 .06  0 0 1.7 0 -.68" result="fibreTint"/>
    <feComposite in="fibreTint" in2="sheet" operator="in" result="grain"/>
    <feGaussianBlur in="sheet" stdDeviation="20" result="soft"/>
    <feComposite in="sheet" in2="soft" operator="out" result="rim"/>
    <feColorMatrix in="rim" type="matrix" values="0 0 0 0 .30  0 0 0 0 .15  0 0 0 0 .04  0 0 0 2.4 0" result="burn"/>
    <feMerge><feMergeNode in="sheet"/><feMergeNode in="stains"/><feMergeNode in="grain"/><feMergeNode in="burn"/></feMerge>
  </filter>
  <filter id="mc-fray" x="-4%" y="-4%" width="108%" height="108%">
    <feTurbulence type="fractalNoise" baseFrequency=".12" numOctaves="3" seed="8" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="20" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="mc-ink" x="-6%" y="-6%" width="112%" height="112%">
    <feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="5" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="6" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="mc-brush" x="-15%" y="-15%" width="130%" height="130%">
    <feTurbulence type="fractalNoise" baseFrequency=".05 .09" numOctaves="3" seed="9" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="13" xChannelSelector="R" yChannelSelector="G" result="wobbly"/>
    <feTurbulence type="fractalNoise" baseFrequency=".035 .4" numOctaves="2" seed="13" result="bristle"/>
    <feColorMatrix in="bristle" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  5 0 0 0 -.85" result="dry"/>
    <feComposite in="wobbly" in2="dry" operator="in"/>
  </filter>
  <filter id="mc-wash"><feGaussianBlur stdDeviation="13"/></filter>
  <radialGradient id="mc-sheet" cx="52%" cy="46%" r="72%">
    <stop offset="0" stop-color="#f7e8c2"/><stop offset=".6" stop-color="#ecd5a0"/><stop offset="1" stop-color="#c79c5e"/>
  </radialGradient>
  <path id="mc-wave" d="M0 0q9-11 18 0t18 0 18 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
  <g id="mc-palm">
    <path d="M0 0C5-18 2-36 13-54" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
    <g fill="${LEAF}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round">
      <path d="M13-54C0-72-22-70-34-52-18-60-2-58 13-54Z"/>
      <path d="M13-54C6-76 22-88 40-82 26-78 18-68 13-54Z"/>
      <path d="M13-54C28-70 50-66 58-46 44-56 28-58 13-54Z"/>
      <path d="M13-54C-2-56-14-46-16-30-8-42 2-50 13-54Z"/>
      <path d="M13-54C26-50 36-38 34-22 28-36 22-46 13-54Z"/>
    </g>
    <circle cx="10" cy="-50" r="4" fill="${INK}"/><circle cx="17" cy="-49" r="4" fill="${INK}"/>
  </g>`;

const WAVES = [[90, 250], [150, 330], [240, 240], [300, 130], [420, 110], [560, 90], [700, 120], [790, 190], [860, 300], [830, 400], [880, 470], [230, 420], [110, 420], [300, 620], [430, 590], [540, 620], [660, 540], [150, 620], [270, 330]]
  .map(([x, y]) => `<use href="#mc-wave" x="${x}" y="${y}"/>`)
  .join("");

const COMPASS = `
  <g transform="translate(168 158)" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round">
    <circle r="54" fill="none" stroke-width="2"/><circle r="47" fill="none" stroke-width="1.5" stroke-dasharray="3 6"/>
    <g fill="#ecd5a0"><path d="M0 0-14-14 0-40 14-14Z" transform="rotate(45)"/><path d="M0 0-14-14 0-40 14-14Z" transform="rotate(135)"/><path d="M0 0-14-14 0-40 14-14Z" transform="rotate(225)"/><path d="M0 0-14-14 0-40 14-14Z" transform="rotate(315)"/></g>
    <path d="M0-76 12-12 0 0Z" fill="${RED}"/><path d="M0-76-12-12 0 0Z" fill="#f4e4bd"/>
    <path d="M76 0 12 12 0 0Z" fill="${INK}"/><path d="M76 0 12-12 0 0Z" fill="#f4e4bd"/>
    <path d="M0 76-12 12 0 0Z" fill="${INK}"/><path d="M0 76 12 12 0 0Z" fill="#f4e4bd"/>
    <path d="M-76 0-12-12 0 0Z" fill="${INK}"/><path d="M-76 0-12 12 0 0Z" fill="#f4e4bd"/>
    <circle r="6" fill="${INK}"/>
  </g>`;

const SHIP = `
  <g transform="translate(150 492)" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">
    <path d="M36-92V14" fill="none" stroke-width="5"/>
    <path d="M40-88C74-74 82-40 76-16L40-14Z" fill="#f4e4bd"/>
    <path d="M50-80 52-14M62-68 64-14" fill="none" stroke="${RED}" stroke-width="5"/>
    <path d="M32-84C4-66 0-34 6-18L32-16Z" fill="#f4e4bd"/>
    <path d="M36-92 56-100 38-104Z" fill="${RED}"/>
    <path d="M-16 8H92C88 36 70 46 40 46 10 46-8 34-16 8Z" fill="#a23b24"/>
    <path d="M-10 18H86" fill="none" stroke="#f4e4bd"/>
  </g>
  <use href="#mc-wave" x="108" y="548"/><use href="#mc-wave" x="186" y="556"/>`;

const SERPENT_DOODLE = `
  <g stroke="${INK}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">
    <path d="M652 596C642 578 630 570 612 566 620 580 628 588 634 596Z" fill="${SERPENT}"/>
    <path d="M678 566 672 548 690 556ZM698 557 700 538 714 554Z" fill="${SERPENT}"/>
    <path d="M664 596C670 548 722 548 728 596Z" fill="${SERPENT}"/>
    <path d="M759 570 753 553 771 560ZM778 561 782 544 794 562Z" fill="${SERPENT}"/>
    <path d="M746 596C752 556 796 556 802 596Z" fill="${SERPENT}"/>
    <path d="M820 596C818 544 826 502 860 490 892 478 930 494 926 520 922 540 892 538 878 534 866 546 866 572 876 596Z" fill="${SERPENT}"/>
    <path d="M826 530 810 520 830 510M836 500 824 484 846 490M858 488 856 470 872 484" fill="${SERPENT}"/>
    <path d="M880 534 886 544 892 535 898 545 905 536 911 543 917 533" fill="#f7e8c2" stroke-width="2.5"/>
    <circle cx="893" cy="500" r="12" fill="#f7e8c2"/><circle cx="896" cy="502" r="5.5" fill="${INK}"/>
    <path d="M880 488 906 482" fill="none" stroke-width="4.5"/>
    <circle cx="918" cy="512" r="2.5" fill="${INK}"/>
  </g>
  <use href="#mc-wave" x="620" y="600"/><use href="#mc-wave" x="716" y="604"/><use href="#mc-wave" x="810" y="600"/><use href="#mc-wave" x="892" y="596"/>`;

const ISLAND_DOODLE = `
  <path d="${ISLAND}" ${coast(1.3)} fill="#3f9a99" opacity=".42" filter="url(#mc-wash)"/>
  <g fill="none" stroke="${INK}" stroke-linecap="round">
    <path d="${ISLAND}" ${coast(1.1)} stroke-width="2.5" opacity=".6"/>
    <path d="${ISLAND}" ${coast(1.2)} stroke-width="2.5" stroke-dasharray="14 12" opacity=".4"/>
  </g>
  <path d="${ISLAND}" fill="#eed79c" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <path d="M430 340C440 290 500 270 560 272 630 260 700 290 700 340 700 380 640 400 590 395 530 420 450 400 430 340Z" fill="${LEAF}" opacity=".6" filter="url(#mc-wash)"/>
  <g fill="#b89a63" stroke="${INK}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">
    <path d="M592 318C608 284 622 262 648 250 668 262 692 288 712 318 678 328 626 328 592 318Z"/>
    <path d="M648 250C648 274 640 296 636 322M660 268 668 278M672 284 684 298M656 292 664 306M676 304 684 316" fill="none" stroke-width="3"/>
  </g>
  <g fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round">
    <path d="M444 318q6-8 12 0M470 296q6-8 12 0M566 288q6-8 12 0M720 356q6-8 12 0M690 390q6-8 12 0M452 400q6-8 12 0"/>
  </g>
  <use href="#mc-palm" transform="translate(440 300) scale(1.05)"/>
  <use href="#mc-palm" transform="translate(528 262) scale(.85)"/>
  <use href="#mc-palm" transform="translate(722 372) scale(1.1)"/>
  <g transform="translate(652 424)" stroke="${INK}" stroke-width="3" stroke-linejoin="round">
    <path d="M-18-6C-18-28 18-28 18-6 18 2 12 4 10 8H-10C-12 4-18 2-18-6Z" fill="#f7efd8"/>
    <path d="M-10 8V16H10V8M-3 9V15M3 9V15" fill="#f7efd8" stroke-width="2.5"/>
    <circle cx="-7" cy="-8" r="4.5" fill="${INK}"/><circle cx="7" cy="-8" r="4.5" fill="${INK}"/>
    <path d="M0-3-2 2H2Z" fill="${INK}" stroke-width="1"/>
  </g>`;

const TRAIL = `<path d="M246 516C318 472 360 526 420 474 438 458 452 446 466 434" fill="none" stroke="${RED}" stroke-width="8" stroke-linecap="round" stroke-dasharray="17 17"/>`;

const X_STROKES = ["M462 296C502 336 558 398 616 454", "M622 292C584 336 524 398 464 458"];

/** The X: two brush strokes painted one after the other when the card arrives. */
const THE_X = `
  <g filter="url(#mc-ink)" fill="none" stroke-linecap="round" stroke="#7d0c10" stroke-width="42" opacity=".85">
    <path class="map-card-stroke" pathLength="1" d="${X_STROKES[0]}"/>
    <path class="map-card-stroke second" pathLength="1" d="${X_STROKES[1]}"/>
  </g>
  <g filter="url(#mc-brush)" fill="none" stroke-linecap="round" stroke="${RED}" stroke-width="34">
    <path class="map-card-stroke" pathLength="1" d="${X_STROKES[0]}"/>
    <path class="map-card-stroke second" pathLength="1" d="${X_STROKES[1]}"/>
  </g>`;

const STAINS = `
  <g fill="none" stroke="#6b4216" filter="url(#mc-ink)">
    <circle cx="842" cy="142" r="60" stroke-width="7" opacity=".26"/>
    <circle cx="845" cy="139" r="55" stroke-width="2.5" opacity=".2"/>
  </g>
  <g fill="#6b4216" filter="url(#mc-wash)">
    <ellipse cx="270" cy="590" rx="74" ry="40" opacity=".2"/>
    <ellipse cx="880" cy="600" rx="50" ry="62" opacity=".22"/>
    <ellipse cx="400" cy="130" rx="60" ry="26" opacity=".15"/>
  </g>`;

const FOLDS = `
  <g fill="none" stroke-width="2">
    <path d="M500 34V676" stroke="#5a3512" opacity=".17"/><path d="M503 34V676" stroke="#fff4d6" opacity=".26"/>
    <path d="M30 350H975" stroke="#5a3512" opacity=".15"/><path d="M30 353H975" stroke="#fff4d6" opacity=".22"/>
  </g>`;

const MAP_SVG = `
  <svg class="map-card-sheet" viewBox="0 0 1000 700" xmlns="http://www.w3.org/2000/svg">
    <defs>${FILTERS}</defs>
    <path d="${SHEET}" fill="#f5e6c3" fill-rule="evenodd" filter="url(#mc-fray)"/>
    <path d="${SHEET}" fill="url(#mc-sheet)" fill-rule="evenodd" filter="url(#mc-paper)"/>
    ${STAINS}
    <g filter="url(#mc-ink)">${WAVES}${COMPASS}${SHIP}${SERPENT_DOODLE}${ISLAND_DOODLE}${TRAIL}</g>
    ${THE_X}
    ${FOLDS}
  </svg>`;

/**
 * Hold the map up over the current scene until the player closes it.
 *
 * @param layer The UI layer the card is added to.
 * @param input Space closes the card once `MIN_OPEN_MS` have passed. A scene that reads Space in its own update
 *   gets the press first, so it has to leave Space alone while the card is up (the island does when controls are off).
 * @returns Resolves when the card has gone.
 */
export async function showMapCard(layer: HTMLElement, input: Input): Promise<void> {
  const card = document.createElement("div");
  card.className = "map-card";
  // Reason: the hint is a picture of the Space key too, so the card holds no text at all
  card.innerHTML = `${MAP_SVG}<div class="map-card-key"></div>`;
  layer.appendChild(card);
  audio.playSfx("sfx_chest_open", 0.7);

  await new Promise((r) => setTimeout(r, MIN_OPEN_MS));
  card.classList.add("ready");
  input.consume("Space");
  await new Promise<void>((resolve) => {
    const check = () => (input.consume("Space") ? resolve() : requestAnimationFrame(check));
    check();
  });

  audio.playSfx("sfx_dialogue_advance", 0.6);
  card.classList.add("closing");
  await new Promise((r) => setTimeout(r, CLOSE_MS));
  card.remove();
}
