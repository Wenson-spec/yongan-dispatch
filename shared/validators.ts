import { z } from "zod";

/**
 * 金额/数值字段的通用校验规则
 * 
 * 规则：
 * - 允许正数和零（如 "0", "0.5", "123.45", "99999999.1234"）
 * - 允许负数（如 "-100", "-0.5"）用于退款/调整场景
 * - 最多保留4位小数（用户偏好）
 * - 不允许非数字字符（如 "abc", "12元", "$100"）
 * - 允许空字符串（视为未填写，与 optional 配合）
 * - 整数部分最多10位（数据库 decimal(14,4) 限制）
 */
const DECIMAL_REGEX = /^-?\d{1,10}(\.\d{1,4})?$/;

/**
 * 正数金额正则（不允许负数和零）
 */
const POSITIVE_DECIMAL_REGEX = /^\d{1,10}(\.\d{1,4})?$/;

/**
 * 可选金额字段校验
 * 用于大多数金额字段：customerPrice, quotedPrice, dispatchPrice, actualFreight 等
 * 允许 undefined、空字符串、合法数字字符串（含负数）
 */
export const optionalDecimal = () =>
  z
    .string()
    .optional()
    .refine(
      (val) => {
        if (val === undefined || val === null || val === "") return true;
        return DECIMAL_REGEX.test(val);
      },
      { message: "金额格式不正确，请输入合法数字（最多4位小数）" }
    );

/**
 * 必填金额字段校验（允许负数，用于退款等场景）
 * 用于必填金额字段：如 priceAndAssign 中的 dispatchPrice
 */
export const requiredDecimal = () =>
  z
    .string()
    .min(1, "金额不能为空")
    .refine(
      (val) => DECIMAL_REGEX.test(val),
      { message: "金额格式不正确，请输入合法数字（最多4位小数）" }
    );

/**
 * 必填正数金额字段校验（不允许负数和零）
 * 用于定价、运费等必须为正数的场景
 */
export const requiredPositiveDecimal = () =>
  z
    .string()
    .min(1, "金额不能为空")
    .refine(
      (val) => POSITIVE_DECIMAL_REGEX.test(val) && parseFloat(val) > 0,
      { message: "金额必须为正数" }
    );

/**
 * 可选正数金额字段校验（不允许负数，允许零和空）
 * 用于运费、押金等不应为负数的场景
 */
export const optionalPositiveDecimal = () =>
  z
    .string()
    .optional()
    .refine(
      (val) => {
        if (val === undefined || val === null || val === "") return true;
        return POSITIVE_DECIMAL_REGEX.test(val);
      },
      { message: "金额不能为负数" }
    );

/**
 * 可选重量字段校验（只允许正数，不允许负数和零）
 * 用于 weight, chargeableWeight 等
 * 如果提供了值，必须 > 0
 */
export const optionalWeight = () =>
  z
    .string()
    .optional()
    .refine(
      (val) => {
        if (val === undefined || val === null || val === "") return true;
        return /^\d{1,10}(\.\d{1,5})?$/.test(val) && parseFloat(val) > 0;
      },
      { message: "重量必须为正数（不允许负数或零）" }
    );

/**
 * 必填正数重量字段校验（不允许负数和零）
 * 用于 weight 等必填重量字段
 */
export const requiredPositiveWeight = () =>
  z
    .string()
    .min(1, "重量不能为空")
    .refine(
      (val) => /^\d{1,10}(\.\d{1,5})?$/.test(val) && parseFloat(val) > 0,
      { message: "重量必须为正数" }
    );

/**
 * 可选数量字段校验（正整数）
 * 用于 packageCount 等
 */
export const optionalPositiveInt = () =>
  z
    .string()
    .optional()
    .refine(
      (val) => {
        if (val === undefined || val === null || val === "") return true;
        return /^\d{1,10}$/.test(val) && parseInt(val) > 0;
      },
      { message: "数量格式不正确，请输入正整数" }
    );
