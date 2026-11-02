/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './*.{ts,tsx}', './{game,host,phone,screen,ui,utils}/**/*.{ts,tsx}'],
  // Listed smallest first so a bigger screen's classes win. `xs` is for phones wider than 400px.
  // `short` is for screens under 500px tall (a phone held sideways) and comes last so it can
  // shrink things on those; laptops and the stream screen never match it.
  theme: {
    screens: {
      xs: '400px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
      short: {raw: '(max-height: 500px)'},
    },
  },
  plugins: [],
};
