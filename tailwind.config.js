/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'media',
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './views/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  // Note: `fontFamily.sans` is deliberately left at Tailwind's default system
  // stack — the same one the old Tailwind CDN used. Base body text is set to
  // Plus Jakarta Sans in index.css; `font-sans` elements use the system font.
  // This keeps the exact typography the site had before the CDN was removed.
  theme: {
    extend: {},
  },
  plugins: [],
};
