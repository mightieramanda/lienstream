import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        'inter': ['Inter', 'sans-serif'],
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        chart: {
          "1": "var(--chart-1)",
          "2": "var(--chart-2)",
          "3": "var(--chart-3)",
          "4": "var(--chart-4)",
          "5": "var(--chart-5)",
        },
        sidebar: {
          DEFAULT: "var(--sidebar-background)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
        slate: {
          50: 'hsl(210, 33%, 98%)',
          100: 'hsl(214, 20%, 95%)',
          200: 'hsl(214, 20%, 88%)',
          300: 'hsl(213, 15%, 78%)',
          400: 'hsl(210, 9%, 65%)',
          500: 'hsl(210, 9%, 55%)',
          600: 'hsl(210, 9%, 45%)',
          700: 'hsl(210, 10%, 35%)',
          800: 'hsl(210, 15%, 23%)',
          900: 'hsl(210, 22%, 12%)',
        },
        blue: {
          50: 'hsl(217, 100%, 97%)',
          100: 'hsl(215, 100%, 92%)',
          200: 'hsl(215, 98%, 85%)',
          300: 'hsl(216, 96%, 77%)',
          400: 'hsl(217, 93%, 69%)',
          500: 'hsl(217, 91%, 60%)',
          600: 'hsl(217, 91%, 60%)',
          700: 'hsl(217, 91%, 50%)',
          800: 'hsl(217, 84%, 41%)',
          900: 'hsl(218, 70%, 32%)',
        },
        emerald: {
          100: 'hsl(152, 57%, 92%)',
          500: 'hsl(160, 84%, 39%)',
          600: 'hsl(158, 64%, 34%)',
        },
        amber: {
          100: 'hsl(48, 100%, 92%)',
          600: 'hsl(42, 93%, 56%)',
        },
        purple: {
          100: 'hsl(270, 100%, 95%)',
          600: 'hsl(271, 81%, 56%)',
        },
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
