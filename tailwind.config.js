/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // 品牌紫阶（统一替换 Tailwind 默认紫，保证全站只有一套紫色体系）
        purple: {
          50: '#f6f3fe',
          100: '#ece6fc',
          200: '#dcd1f8',
          300: '#c2aef2',
          400: '#a483e8',
          500: '#8a68da',
          600: '#7557c8',
          700: '#5b3fae',
          800: '#48328a',
          900: '#38266a',
        },
        primary: '#7557c8',
        primaryDark: '#5b3fae',
        ink: '#191521',
        muted: '#6f6a7e',
        canvas: '#f7f6fb',
        hero: '#f3f0fd',
        detail: '#f6f3fe',
        success: '#1f7a63',
        successSoft: '#e6f5ef',
        danger: '#b8402f',
        dangerSoft: '#fdecea',
      },
      borderRadius: {
        card: '18px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(25, 21, 33, 0.04), 0 8px 24px -16px rgba(25, 21, 33, 0.18)',
        hover: '0 2px 4px rgba(25, 21, 33, 0.05), 0 18px 40px -20px rgba(117, 87, 200, 0.4)',
        float: '0 4px 12px rgba(25, 21, 33, 0.08), 0 24px 56px -24px rgba(25, 21, 33, 0.28)',
        button: '0 1px 2px rgba(91, 63, 174, 0.24), 0 8px 20px -12px rgba(91, 63, 174, 0.6)',
      },
      fontFamily: {
        sans: ['"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', '"Noto Sans SC"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
