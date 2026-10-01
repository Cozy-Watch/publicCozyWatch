import { Box, Flex } from "@radix-ui/themes";
import { Outlet, useMatchRoute } from "@tanstack/react-router";
import { Header } from "../Header/Header";
import { ApplicationNavigation } from "./components/ApplicationNavigation/ApplicationNavigation";

const titlebarSize = "30px";

export const Root = () => {
  const matchRoute = useMatchRoute();

  const isAuthenticationRoute = !!matchRoute({ to: "/" });
  const isMenubar = !!matchRoute({ to: "/menubar" });
  const isSettings = !!matchRoute({ to: "/settings" });

  const isAuthenticated = !isAuthenticationRoute;

  if (isMenubar) {
    return (
      <Box width="480px" height="640px" className="menubar-bg">
        <Outlet />
      </Box>
    );
  }

  return (
    <Flex
      direction="column"
      height="100dvh"
      style={{
        borderRadius: "10px",
        border: "4px solid var(--accent-5)",
        overflow: "hidden",
        background: "var(--accent-a1)",
      }}
    >
      {!isAuthenticated && (
        <Box
          id="toolbar"
          flexShrink="0"
          // toolbar needed for drag the app
          style={{
            height: titlebarSize,
            background: "var(--accent-a12)",
            marginBottom: `-${titlebarSize}`,
          }}
        />
      )}

      {isAuthenticated && (
        <Box position="relative" flexShrink="0" style={{ zIndex: 1 }}>
          <Box
            id="toolbar"
            // toolbar needed for drag the app
            style={{ height: titlebarSize }}
          />

          <Header />
          {!isSettings && <ApplicationNavigation />}
        </Box>
      )}

      <Flex
        position="relative"
        direction="column"
        flexGrow="1"
        minHeight="0"
        style={{
          ...(!isAuthenticated
            ? {
                borderRadius: "8px",
                background:
                  "linear-gradient(135deg, var(--accent-a2) 0%,  var(--accent-a1) 50%, var(--accent-a1) 90%)",
              }
            : {}),
        }}
        overflow="hidden"
      >
        <Outlet />
      </Flex>
    </Flex>
  );
};
