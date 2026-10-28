/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './*.{ts,tsx}', './{utils,game,host,phone}/**/*.{ts,tsx}'],
  // `xs` is for phones wider than 400px, such as showing the round name in the header.
  theme: {extend: {screens: {xs: '400px'}}},
  plugins: [],
};
