import { useCallback, useRef, useState } from "react";

/**
 * 通用防重复提交 Hook
 * 
 * 功能：
 * 1. 提交期间按钮自动禁用 + 显示加载状态
 * 2. 防止快速双击导致重复请求
 * 3. 提交完成后自动恢复（成功或失败都恢复）
 * 4. 支持最小加载时间（防止闪烁）
 * 
 * 用法：
 * const { isSubmitting, guardedSubmit } = useSubmitGuard();
 * <Button disabled={isSubmitting} onClick={guardedSubmit(async () => { await mutation.mutateAsync(...) })}>
 *   {isSubmitting ? "提交中..." : "提交"}
 * </Button>
 */
export function useSubmitGuard(minLoadingMs = 300) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lockRef = useRef(false);

  const guardedSubmit = useCallback(
    (fn: () => Promise<void>) => {
      return async () => {
        // 防止并发调用
        if (lockRef.current) return;
        lockRef.current = true;
        setIsSubmitting(true);

        const startTime = Date.now();
        try {
          await fn();
        } catch (error) {
          // 错误由调用方的 onError 处理，这里只负责恢复状态
          throw error;
        } finally {
          // 确保最小加载时间，防止闪烁
          const elapsed = Date.now() - startTime;
          if (elapsed < minLoadingMs) {
            await new Promise((r) => setTimeout(r, minLoadingMs - elapsed));
          }
          setIsSubmitting(false);
          lockRef.current = false;
        }
      };
    },
    [minLoadingMs]
  );

  return { isSubmitting, guardedSubmit };
}

/**
 * 用于 tRPC mutation 的防重复提交 Hook
 * 
 * 直接包装 mutation 的 mutateAsync，自动管理加载状态
 * 
 * 用法：
 * const mutation = trpc.order.create.useMutation({ onSuccess: ... });
 * const { isSubmitting, submit } = useMutationGuard(mutation);
 * <Button disabled={isSubmitting} onClick={() => submit({ orderNumber: "..." })}>
 *   {isSubmitting ? "提交中..." : "提交"}
 * </Button>
 */
export function useMutationGuard<TInput, TOutput>(
  mutation: {
    mutateAsync: (input: TInput) => Promise<TOutput>;
    isPending: boolean;
  },
  minLoadingMs = 300
) {
  const lockRef = useRef(false);
  const [localLoading, setLocalLoading] = useState(false);

  const submit = useCallback(
    async (input: TInput) => {
      if (lockRef.current) return;
      lockRef.current = true;
      setLocalLoading(true);

      const startTime = Date.now();
      try {
        const result = await mutation.mutateAsync(input);
        return result;
      } finally {
        const elapsed = Date.now() - startTime;
        if (elapsed < minLoadingMs) {
          await new Promise((r) => setTimeout(r, minLoadingMs - elapsed));
        }
        setLocalLoading(false);
        lockRef.current = false;
      }
    },
    [mutation.mutateAsync, minLoadingMs]
  );

  const isSubmitting = localLoading || mutation.isPending;

  return { isSubmitting, submit };
}
