import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";

const AUTH_TOKEN_KEY = "yongan_auth_token";

// 从URL参数中提取auth_token（OAuth回调后传递）
const urlParams = new URLSearchParams(window.location.search);
const authTokenFromUrl = urlParams.get("auth_token");
if (authTokenFromUrl) {
  localStorage.setItem(AUTH_TOKEN_KEY, authTokenFromUrl);
  // 清除URL中的token参数，避免泄露
  const cleanUrl = window.location.pathname + (window.location.hash || "");
  window.history.replaceState({}, "", cleanUrl);
} else if (!localStorage.getItem(AUTH_TOKEN_KEY)) {
  // 如果localStorage中没有token，尝试从session cookie中获取
  fetch("/api/auth/session-token", { credentials: "include" })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data?.token) {
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      }
    })
    .catch(() => { /* ignore */ });
}

const queryClient = new QueryClient();

const redirectToLogin = () => {
  // 清除token并跳转到登录页
  localStorage.removeItem(AUTH_TOKEN_KEY);
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    if (error instanceof TRPCClientError && error.data?.code === "FORBIDDEN") {
      redirectToLogin();
    }
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    if (error instanceof TRPCClientError && error.data?.code === "FORBIDDEN") {
      redirectToLogin();
    }
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        const token = localStorage.getItem(AUTH_TOKEN_KEY);
        if (token) {
          return { Authorization: `Bearer ${token}` };
        }
        return {};
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
