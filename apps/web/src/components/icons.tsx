import * as React from "react";
export const CodexIcon = (
  props: React.JSX.IntrinsicAttributes & React.SVGProps<SVGSVGElement>,
) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 250 250"
      width={250}
      height={250}
      {...props}
    >
      <defs>
        <linearGradient
          id="codex-icon-gradient"
          gradientUnits="userSpaceOnUse"
          x2={1}
          gradientTransform="matrix(0,249.335,-249.128,0,125,.332)"
        >
          <stop stopColor="#b1a7ff" />
          <stop offset={0.5} stopColor="#7a9dff" />
          <stop offset={1} stopColor="#3941ff" />
        </linearGradient>
      </defs>
      <path
        fill="url(#codex-icon-gradient)"
        d="m84.3 5.1q3.7-1.5 7.7-2.6 3.9-1 7.9-1.6 4-0.5 8.1-0.6 4 0 8 0.5 20.7 2.4 37.1 17.7 0.1 0.1 0.4 0.3 0.1 0 0.2 0 0 0 0.2 0 0 0 0.1 0 0 0 0.1 0 5.2-1.4 10.7-1.9 5.4-0.4 10.7 0.1 5.5 0.4 10.7 1.9 5.2 1.3 10.1 3.6l0.6 0.4 1.6 0.8q5.2 2.5 9.7 6.1 4.7 3.4 8.6 7.7 3.8 4.3 6.9 9.2 3 4.8 5.2 10.2 4.3 10.5 4.3 22.1 0.2 2.1 0 4.2-0.1 2.2-0.2 4.3-0.3 2.1-0.7 4.3-0.4 2.1-0.9 4.1 0 0.2 0 0.4 0 0.2 0 0.5 0 0.1 0.1 0.4 0.1 0.1 0.3 0.3 12.3 12.6 16.3 30 6 29.7-12.2 53.5l-1.9 2.2q-3 3.5-6.5 6.4-3.4 3.1-7.3 5.5-3.8 2.4-8.1 4.2-4.1 1.9-8.5 3.2-0.3 0-0.4 0.2-0.3 0-0.4 0.1-0.1 0.1-0.3 0.4 0 0.1-0.1 0.3c-2.7 7.7-5.3 14.2-10.2 20.7-12.5 16.5-30.8 25.5-51.5 25.5q-24.6-0.1-43.6-18.1-0.2-0.1-0.4-0.2-0.2-0.1-0.4-0.1-0.2 0-0.3 0-0.3 0-0.4 0c-5.4 1.7-10.9 1.9-16.7 1.9q-3.5 0-7-0.5-3.4-0.4-6.9-1.2-3.3-0.8-6.6-2-3.3-1.2-6.4-2.8-3.3-1.6-6.4-3.6-3-2-5.8-4.3-3-2.3-5.5-5-2.5-2.6-4.6-5.6c-2.2-2.7-4.3-5.4-5.8-8.5q-0.8-1.6-1.6-3.2-0.6-1.7-1.3-3.3-0.7-1.7-1.2-3.4-0.5-1.6-1-3.4-1.1-4-1.6-7.9-0.6-4-0.6-8 0-4 0.6-8 0.4-4 1.4-8 0 0 0-0.1 0-0.1 0-0.1 0.2-0.2 0.2-0.3 0-0.1-0.2-0.1 0-0.2 0-0.3 0-0.1-0.1-0.1 0-0.2 0-0.2-0.1-0.1-0.1-0.1-2.4-2.5-4.6-5.2-2.1-2.7-4-5.4-1.7-3-3.2-6-1.5-3.1-2.6-6.3-0.8-2-1.3-4.1-0.7-2-1.1-4-0.4-2.1-0.7-4.2-0.2-2.2-0.4-4.3-0.2-2.8-0.1-5.6 0-2.8 0.3-5.4 0.1-2.8 0.6-5.6 0.4-2.8 1.1-5.5 7-23.1 26.9-36.3 4.3-2.9 8.2-4.5 4.5-1.9 9-3.2 0.2 0 0.3-0.1 0.1-0.2 0.3-0.3 0.1 0 0.1-0.3 0.1-0.1 0.1-0.2 1-3.1 2.2-6 1-2.9 2.5-5.7 1.5-3 3.2-5.6 1.7-2.7 3.7-5.1 2.5-3.2 5.3-5.9 3-2.8 6.1-5.4 3.2-2.4 6.8-4.4 3.5-2 7.2-3.5zm48.3 146.4c-2.3 0.1-4.4 1-6 2.8-1.5 1.6-2.4 3.7-2.4 5.9 0 2.3 0.9 4.4 2.4 6.2 1.6 1.6 3.7 2.5 6 2.6h50.4c2.4 0.1 4.8-0.6 6.5-2.4 1.7-1.6 2.8-4 2.8-6.4 0-2.4-1.1-4.7-2.8-6.3-1.7-1.8-4.1-2.6-6.5-2.4zm-56.7-64.9c-1.2-1.9-3-3.4-5.3-3.9-2.2-0.5-4.5-0.3-6.5 0.9-2 1.1-3.5 3-4.1 5.2-0.7 2.2-0.4 4.6 0.6 6.5l17.7 30.9-17.5 29.5c-1.2 2-1.6 4.5-1.1 6.8 0.7 2.3 2.1 4.1 4.1 5.3 2 1.2 4.4 1.6 6.7 0.9 2.2-0.5 4.2-1.9 5.4-3.9l20.1-34.1q0.7-0.9 0.9-2.1 0.3-1.1 0.3-2.3 0-1.2-0.2-2.2-0.2-1.2-0.8-2.2z"
      />
    </svg>
  );
};

export const MicrosoftWord = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} viewBox="0 0 486 500">
    <defs>
      <radialGradient
        id="microsoft_word-a"
        cx="-689.34"
        cy="753.93"
        r="13.89"
        fx="-689.34"
        fy="753.93"
        gradientTransform="matrix(47.56 0 0 -20.15 33260.63 15691.18)"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset=".18" stopColor="#1657f4" />
        <stop offset=".57" stopColor="#0036c4" />
      </radialGradient>
      <radialGradient
        id="microsoft_word-c"
        cx="-730.97"
        cy="806.4"
        r="13.89"
        fx="-730.97"
        fy="806.4"
        gradientTransform="matrix(-20.22495 21.28288 52.40647 49.82267 -56559.12 -24498.36)"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset=".14" stopColor="#d471ff" />
        <stop offset=".83" stopColor="#509df5" stopOpacity="0" />
      </radialGradient>
      <radialGradient
        id="microsoft_word-d"
        cx="-682.21"
        cy="801.86"
        r="13.89"
        fx="-682.21"
        fy="801.86"
        gradientTransform="matrix(0 18.62 101.62 0 -81063.08 13022.32)"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset=".28" stopColor="#4f006f" stopOpacity="0" />
        <stop offset="1" stopColor="#4f006f" />
      </radialGradient>
      <radialGradient
        id="microsoft_word-f"
        cx="-749.58"
        cy="798.74"
        r="13.89"
        fx="-749.58"
        fy="798.74"
        gradientTransform="matrix(-28.7167 6.70901 16.06567 68.78884 -33867.69 -49911.37)"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset=".06" stopColor="#e4a7fe" />
        <stop offset=".54" stopColor="#e4a7fe" stopOpacity="0" />
      </radialGradient>
      <radialGradient
        id="microsoft_word-g"
        cx="-675.64"
        cy="797.48"
        r="13.89"
        fx="-675.64"
        fy="797.48"
        gradientTransform="matrix(15.99196 15.99755 15.99476 -15.99476 -1949 23805.98)"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset=".08" stopColor="#367af2" />
        <stop offset=".87" stopColor="#001a8f" />
      </radialGradient>
      <radialGradient
        id="microsoft_word-h"
        cx="-657.62"
        cy="854.65"
        r="13.89"
        fx="-657.62"
        fy="854.65"
        gradientTransform="matrix(0 11.2 12.76 0 -10796.09 7734.8)"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset=".59" stopColor="#2763e5" stopOpacity="0" />
        <stop offset=".97" stopColor="#58aafe" />
      </radialGradient>
      <linearGradient
        id="microsoft_word-b"
        x1="69.43"
        x2="388.45"
        y1="238.11"
        y2="238.11"
        gradientTransform="matrix(1 0 0 -1 0 502)"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0" stopColor="#66c0ff" />
        <stop offset=".26" stopColor="#0094f0" />
      </linearGradient>
      <linearGradient
        id="microsoft_word-e"
        x1="69.48"
        x2="485.94"
        y1="380.04"
        y2="373.16"
        gradientTransform="matrix(1 0 0 -1 0 502)"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0" stopColor="#9deaff" />
        <stop offset=".2" stopColor="#3bd5ff" />
      </linearGradient>
    </defs>
    <path
      d="m69.43 376.25 194.4-237.36L486 293.13v158.26c0 26.85-21.76 48.61-48.6 48.61H152.74c-46.01 0-83.31-37.31-83.31-83.33v-40.42Z"
      style={{ fill: "url(#microsoft_word-a)" }}
    />
    <path
      d="M69.43 208.87c0-34.52 27.98-62.5 62.49-62.5h283.11L486 111.11v173.61c0 26.85-21.76 48.61-48.6 48.61H152.74c-46.01 0-83.31 37.31-83.31 83.33v-207.8Z"
      style={{ fill: "url(#microsoft_word-b)" }}
    />
    <path
      d="M69.43 208.87c0-34.52 27.98-62.5 62.49-62.5h283.11L486 111.11v173.61c0 26.85-21.76 48.61-48.6 48.61H152.74c-46.01 0-83.31 37.31-83.31 83.33v-207.8Z"
      style={{ fill: "url(#microsoft_word-c)", fillOpacity: ".6" }}
    />
    <path
      d="M69.43 208.87c0-34.52 27.98-62.5 62.49-62.5h283.11L486 111.11v173.61c0 26.85-21.76 48.61-48.6 48.61H152.74c-46.01 0-83.31 37.31-83.31 83.33v-207.8Z"
      style={{ fill: "url(#microsoft_word-d)", fillOpacity: ".1" }}
    />
    <path
      d="M69.43 83.33C69.43 37.31 106.73 0 152.74 0H437.4C464.24 0 486 21.76 486 48.61v69.44c0 26.85-21.76 48.61-48.6 48.61H152.74c-46.01 0-83.31 37.31-83.31 83.33V83.33Z"
      style={{ fill: "url(#microsoft_word-e)" }}
    />
    <path
      d="M69.43 83.33C69.43 37.31 106.73 0 152.74 0H437.4C464.24 0 486 21.76 486 48.61v69.44c0 26.85-21.76 48.61-48.6 48.61H152.74c-46.01 0-83.31 37.31-83.31 83.33V83.33Z"
      style={{ fill: "url(#microsoft_word-f)", fillOpacity: ".8" }}
    />
    <rect
      width="222.17"
      height="222.22"
      y="236.11"
      rx="45.13"
      ry="45.13"
      style={{ fill: "url(#microsoft_word-g)" }}
    />
    <rect
      width="222.17"
      height="222.22"
      y="236.11"
      rx="45.13"
      ry="45.13"
      style={{ fill: "url(#microsoft_word-h)", fillOpacity: ".65" }}
    />
    <path
      d="M187.26 283.73 159.92 410.7l-32.69.02-16.14-76.19-16.9 76.19h-33L34.91 283.75h26.95l16.21 83.79 16.11-83.79h33.04l16.87 83.79 15.82-83.79 27.34-.02Z"
      style={{ fill: "#fff" }}
    />
  </svg>
);
