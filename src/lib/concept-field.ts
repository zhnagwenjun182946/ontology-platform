/**
 * 概念名 ↔ 抽取 JSON 字段名 的双向映射（领域无关，单一事实来源）。
 *
 * 抽取 JSON 约定为「每个概念顶层一个字段」的嵌套结构：
 *   - 主/单数概念 → 单数字段（Employee → employee），值为对象或 null
 *   - 明细概念 → 复数字段（AccommodationFee → accommodationFees），值为数组
 * 规则 targetPath（如 accommodationFees[*]）与字段名一致，链路闭环。
 *
 * 概念名按 DomainConcept.localName（PascalCase，无空格）传入；为容错
 * Concept.labelEn（可能带空格，如 "Accommodation Fee"），所有概念→字段
 * 转换都先去空格再计算。字段名本身不含空格，无需反向处理。
 */

/** 去空格：把可能带空格的概念名（labelEn）规范化为 PascalCase。 */
function normalize(concept: string): string {
  return concept.replace(/\s+/g, "");
}

/**
 * 概念名 → 单数字段名。
 *   Employee → employee
 *   Travel Request → travelRequest
 */
export function conceptToSingularField(concept: string): string {
  const c = normalize(concept);
  return c.charAt(0).toLowerCase() + c.slice(1);
}

/**
 * 概念名 → 复数字段名。
 *   AccommodationFee → accommodationFees
 *   Meal Fee → mealFees
 *   Employee → employees
 */
export function conceptToPluralField(concept: string): string {
  const lower = conceptToSingularField(concept);
  if (lower.endsWith("y")) return lower.slice(0, -1) + "ies";
  if (lower.endsWith("s")) return lower;
  return lower + "s";
}

/**
 * 字段名 → 概念名（conceptToSingularField 的逆运算）。
 *   accommodationFees → AccommodationFee
 *   employee → Employee
 *   travelRequest → TravelRequest
 */
export function fieldToConceptName(field: string): string {
  let singular = field;
  if (singular.endsWith("ies")) singular = singular.slice(0, -3) + "y";
  else if (singular.endsWith("s") && !singular.endsWith("ss")) singular = singular.slice(0, -1);
  return singular.charAt(0).toUpperCase() + singular.slice(1);
}

/**
 * 明细概念判定：localName 含 item/line/detail/fee/expense/cost → 明细（对应数组字段）。
 *   AccommodationFee → true，AccommodationExpense → true，Employee → false
 *
 * 注意：这是名称兜底启发式。更可靠的是用 DomainRelation 的 CONTAINS
 * 判定（见 buildDetailConceptSet）——明细概念 = CONTAINS 关系的 target。
 * LLM 命名不确定（Fee/Expense/Cost 都可能），名称兜底只在无关系数据时用。
 */
export function isDetailConcept(localName: string): boolean {
  const lower = localName.toLowerCase();
  return ["item", "line", "detail", "fee", "expense", "cost"].some((k) => lower.includes(k));
}

/**
 * 从领域关系构建「明细概念 localName 集合」：CONTAINS 关系的 target 即明细。
 * 比按名字猜（isDetailConcept）更可靠，不受 LLM 命名差异（Fee/Expense/Cost）影响。
 *
 * @param relations 关系列表，每项含 source/target（localName）与 relationType
 * @returns Set<localName> 被某个主概念 CONTAINS 的明细概念名
 */
export function buildDetailConceptSet(
  relations: Array<{ source: string; target: string; relationType: string }>,
): Set<string> {
  const set = new Set<string>();
  for (const r of relations) {
    if ((r.relationType ?? "").toUpperCase() === "CONTAINS" && r.target) {
      set.add(r.target);
    }
  }
  return set;
}

/**
 * 判定某概念是否为明细：优先用关系推导出的明细集合，缺失时回退到名称启发式。
 * 这是领域无关、且不被 LLM 命名差异影响的判定方式。
 */
export function isDetailConceptResolved(
  localName: string,
  detailSet: Set<string>,
): boolean {
  if (detailSet.size > 0) return detailSet.has(localName);
  return isDetailConcept(localName);
}
