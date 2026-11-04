import { MantineProvider, createTheme } from "@mantine/core";
import { useMemo } from "react";
import { AppShell } from "./components/Layout/AppShell";
import { useLook } from "./look";

export default function App() {
  // A source's look can bring its own primary colour (Viber's purple instead of blue)
  const { palette } = useLook();
  const theme = useMemo(
    () => (palette ? createTheme({ colors: { brand: palette }, primaryColor: "brand" }) : undefined),
    [palette],
  );

  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <AppShell />
    </MantineProvider>
  );
}
