import ReactDOM from "react-dom/client";
import { Router } from "./views/Router";
import "./index.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const start =
  (window as Window & { __APP_START?: number }).__APP_START ??
  performance.now();
(window as Window & { __APP_START?: number }).__APP_START = start;

const root = ReactDOM.createRoot(document.getElementById("app") as HTMLElement);

const queryClient = new QueryClient();

root.render(
  <QueryClientProvider client={queryClient}>
    <Router />
  </QueryClientProvider>
);
