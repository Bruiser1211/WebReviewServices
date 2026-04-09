import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  {
    ignores: [
      ".next/**",
      "launcher/build-tmp/**",
      "launcher/dist/**",
      "tmp/**"
    ]
  },
  ...nextCoreWebVitals,
  ...nextTypescript
];

export default config;
