/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      typography: ({ theme }) => ({
        base: {
          css: {
            color: theme("colors.gray.800"),
            a: {
              color: theme("colors.blue.600"),
              "&:hover": {
                color: theme("colors.blue.500"),
              },
            },
            "h1, h2, h3": {
              scrollMarginTop: theme("spacing.24"),
            },
            p: {
              marginBottom: theme("spacing.1"),
              marginTop: theme("spacing.1"),
            },
            ol: {
              marginBottom: theme("spacing.1"),
              marginTop: theme("spacing.1"),
              listStyleType: "decimal",
            },
            "ol ol": {
              listStyleType: "lower-alpha",
              marginBottom: "0px",
              marginTop: "0px",
            },
            "ol ol ol": {
              listStyleType: "lower-roman",
              marginBottom: "0px",
              marginTop: "0px",
            },
            "ol > li::marker": {
              color: theme("colors.gray.800"),
            },
            "ol ol > li::marker": {
              color: theme("colors.gray.800"),
            },
            "ol ol ol > li::marker": {
              color: theme("colors.gray.800"),
            },
            ul: {
              marginBottom: theme("spacing.1"),
              marginTop: theme("spacing.1"),
              listStyleType: "disc",
            },
            "ul ul": {
              listStyleType: "circle",
              marginBottom: "0px",
              marginTop: "0px",
            },
            "ul ul ul": {
              listStyleType: "square",
              marginBottom: "0px",
              marginTop: "0px",
            },
            "ul > li::marker": {
              color: theme("colors.gray.800"),
              fontSize: "1.25rem",
            },
            "ul ul > li::marker": {
              color: theme("colors.gray.800"),
            },
            "ul ul ul > li::marker": {
              color: theme("colors.gray.800"),
            },
            code: {
              fontWeight: "600",
            },
            // override max-width if you want
            maxWidth: "100%",
          },
        },
        // you can define other modifiers like 'lg', etc.
      }),
    },
  },
  // Note: plugin still needs to be loaded via CSS or via JS config (depending)
};
