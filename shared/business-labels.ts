/**
 * ═══════════════════════════════════════════════════════════════════
 *  BUSINESS LABELS — Multi-sector SaaS vocabulary
 *
 *  القاعدة:
 *  1. كل نوع بزنس → labels افتراضية ذكية (zero-config)
 *  2. كل workspace يمكنه تخصيص client_label / staff_label يدوياً
 *     (يُحفظ في workspace_bot_settings)
 *  3. الكود يستخدم getWorkspaceLabels() دائماً — لا hardcoded strings
 * ═══════════════════════════════════════════════════════════════════
 */

export type BusinessType =
  | "clinic"
  | "store"
  | "restaurant"
  | "real_estate"
  | "salon"
  | "other";

export interface WorkspaceLabels {
  /** تسمية العميل/المستخدم — "مريض" / "عميل" / "زبون" */
  clientLabel: string;
  /** تسمية مقدم الخدمة — "الطبيب" / "المصمم" / "الوكيل" */
  staffLabel: string;
  /** تسمية الخدمة — "الموعد" / "الطلب" / "الزيارة" */
  serviceLabel: string;
  /** تسمية المكان — "عيادتنا" / "متجرنا" / "مطعمنا" */
  placeLabel: string;
  /** إيموجي يُستخدم في التذكيرات والرسائل */
  brandEmoji: string;
  /** إيموجي لمقدم الخدمة */
  staffEmoji: string;
}

/** Default labels per business type */
const BUSINESS_LABELS: Record<BusinessType, WorkspaceLabels> = {
  clinic: {
    clientLabel:  "مريض",
    staffLabel:   "الطبيب",
    serviceLabel: "الموعد",
    placeLabel:   "عيادتنا",
    brandEmoji:   "🏥",
    staffEmoji:   "👨‍⚕️",
  },
  salon: {
    clientLabel:  "عميل",
    staffLabel:   "المختص",
    serviceLabel: "الجلسة",
    placeLabel:   "صالوننا",
    brandEmoji:   "✂️",
    staffEmoji:   "💇",
  },
  store: {
    clientLabel:  "عميل",
    staffLabel:   "المسؤول",
    serviceLabel: "الطلب",
    placeLabel:   "متجرنا",
    brandEmoji:   "🛍️",
    staffEmoji:   "🧑‍💼",
  },
  restaurant: {
    clientLabel:  "زبون",
    staffLabel:   "المسؤول",
    serviceLabel: "الحجز",
    placeLabel:   "مطعمنا",
    brandEmoji:   "🍽️",
    staffEmoji:   "👨‍🍳",
  },
  real_estate: {
    clientLabel:  "عميل",
    staffLabel:   "الوكيل",
    serviceLabel: "الموعد",
    placeLabel:   "شركتنا",
    brandEmoji:   "🏠",
    staffEmoji:   "🧑‍💼",
  },
  other: {
    clientLabel:  "عميل",
    staffLabel:   "المختص",
    serviceLabel: "الموعد",
    placeLabel:   "شركتنا",
    brandEmoji:   "⭐",
    staffEmoji:   "🧑‍💼",
  },
};

/**
 * يُرجع الـ labels المناسبة للـ workspace.
 *
 * الأولوية:
 * 1. القيم المخصصة يدوياً في bot_settings (client_label / staff_label)
 * 2. الـ defaults الذكية حسب نوع البزنس
 *
 * @param businessType  - نوع النشاط من workspace.business_type
 * @param overrides     - تخصيصات يدوية من workspace_bot_settings (اختياري)
 */
export function getWorkspaceLabels(
  businessType: string | null | undefined,
  overrides?: {
    client_label?: string | null;
    staff_label?: string | null;
  }
): WorkspaceLabels {
  const type = (businessType ?? "other") as BusinessType;
  const defaults = BUSINESS_LABELS[type] ?? BUSINESS_LABELS.other;

  return {
    ...defaults,
    // التخصيص اليدوي يتغلب على الافتراضي
    ...(overrides?.client_label ? { clientLabel: overrides.client_label } : {}),
    ...(overrides?.staff_label  ? { staffLabel:  overrides.staff_label  } : {}),
  };
}

/** القائمة الكاملة لأنواع النشاط (للـ dropdowns) */
export const BUSINESS_TYPE_OPTIONS: Array<{ value: BusinessType; label: string }> = [
  { value: "clinic",      label: "عيادة طبية"   },
  { value: "salon",       label: "صالون تجميل"  },
  { value: "store",       label: "متجر"          },
  { value: "restaurant",  label: "مطعم"          },
  { value: "real_estate", label: "عقارات"        },
  { value: "other",       label: "أخرى"          },
];
