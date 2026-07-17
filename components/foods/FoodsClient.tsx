"use client";

/**
 * Food Database — master-detail editor, port of pages/foods.py.
 * Left: searchable food list. Right: create/edit form.
 */
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteFoodAction, saveFoodAction } from "@/app/actions/foods";
import {
  NUTRIENT_KEYS,
  NUTRIENT_LABELS,
  type NutrientKey,
  type UnitType,
} from "@/lib/constants";
import type { FoodItem } from "@/lib/domain/types";
import ToastContainer, { type ToastMessage } from "@/components/ui/Toast";

/** A food row tagged with whether the current user owns it (deletable) vs a
 *  shared canonical food (not user-deletable). */
type EditableFood = FoodItem & { owned: boolean };

interface FormState {
  id: string | null;
  name: string;
  unit_type: UnitType;
  serving_size_g: string;
  nutrients: Record<NutrientKey, string>;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: "",
  unit_type: "per_100g",
  serving_size_g: "",
  nutrients: {
    energy_kcal: "",
    fat_g: "",
    saturated_fat_g: "",
    carbohydrates_g: "",
    sugar_g: "",
    protein_g: "",
    fibre_g: "",
    salt_g: "",
    calcium_mg: "",
    vitamin_c_mg: "",
  },
};

function foodToForm(food: FoodItem): FormState {
  return {
    id: food.id,
    name: food.name,
    unit_type: food.unit_type,
    serving_size_g: food.serving_size_g !== null ? String(food.serving_size_g) : "",
    nutrients: Object.fromEntries(
      NUTRIENT_KEYS.map((k) => [k, String(food[k])]),
    ) as Record<NutrientKey, string>,
  };
}

/** Cap rendered rows — the DB can hold hundreds of foods; search narrows it. */
const LIST_CAP = 50;

export default function FoodsClient({ initialFoods }: { initialFoods: EditableFood[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState | null>(null);
  const [isPending, startTransition] = useTransition();
  // A pending two-step delete confirmation (the food id awaiting a confirm click).
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  // Set when the unit type is flipped with nutrient values present — the numbers
  // are NOT converted, so warn the user to re-enter them against the new basis.
  const [basisWarning, setBasisWarning] = useState(false);
  // Inline error for the serving-size field (required for per-item foods).
  const [servingError, setServingError] = useState(false);
  const servingRef = useRef<HTMLInputElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  // toasts — the one feedback pattern used on every page
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastId = useRef(0);
  const pushToast = useCallback((text: string, ok: boolean) => {
    if (!text) return;
    toastId.current += 1;
    setToasts((t) => [...t, { id: toastId.current, kind: ok ? "success" : "error", text }]);
  }, []);
  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initialFoods;
    return initialFoods.filter((f) => f.name.toLowerCase().includes(q));
  }, [initialFoods, search]);

  // Render at most LIST_CAP rows, but always keep the food currently open in the
  // editor visible (so its selected highlight never vanishes off the cap).
  const shown = useMemo(() => {
    const base = filtered.slice(0, LIST_CAP);
    if (form?.id && !base.some((f) => f.id === form.id)) {
      const edited = initialFoods.find((f) => f.id === form.id);
      if (edited) return [edited, ...base];
    }
    return base;
  }, [filtered, form?.id, initialFoods]);

  /** Open a food (or a fresh form) in the editor, resetting transient UI state. */
  const openForm = useCallback((next: FormState) => {
    setForm(next);
    setBasisWarning(false);
    setServingError(false);
    setPendingDelete(null);
    // On mobile the list stacks above the editor; scroll it into view so the
    // tap has a visible result instead of silently rendering below the fold.
    requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 768px)").matches) {
        detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }, []);

  function handleSave() {
    if (!form) return;
    // Inline validation: a per-item food needs a serving size. Surface it on the
    // field itself (focus + error) rather than only via a far-away toast.
    if (form.unit_type === "per_item" && form.serving_size_g.trim() === "") {
      setServingError(true);
      servingRef.current?.focus();
      pushToast("Serving size is required for per-item foods", false);
      return;
    }
    startTransition(async () => {
      const parseNum = (s: string) => (s.trim() === "" ? null : Number(s));
      const result = await saveFoodAction({
        id: form.id,
        name: form.name,
        unit_type: form.unit_type,
        serving_size_g: parseNum(form.serving_size_g),
        nutrients: Object.fromEntries(
          NUTRIENT_KEYS.map((k) => [k, parseNum(form.nutrients[k]) ?? 0]),
        ),
      });
      pushToast(result.message, result.ok);
      if (result.ok) {
        setForm(null);
        setBasisWarning(false);
        setServingError(false);
        router.refresh();
      }
    });
  }

  function handleDelete(foodId: string) {
    startTransition(async () => {
      const result = await deleteFoodAction(foodId);
      pushToast(result.message, result.ok);
      setPendingDelete(null);
      if (result.ok) {
        if (form?.id === foodId) setForm(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="page-max-width-1400" style={{ paddingTop: 20 }}>
      <div className="toolbar">
        <div className="toolbar-left">
          <input
            type="search"
            className="search-input-rounded"
            placeholder="Search foods..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn-primary" onClick={() => openForm({ ...EMPTY_FORM })}>
            + New Food
          </button>
        </div>
        <div className="toolbar-right">{initialFoods.length} foods</div>
      </div>

      <div className="master-detail">
        <div className="master-panel">
          <div className="master-list">
            {filtered.length === 0 ? (
              <p className="empty-state-message">No foods found.</p>
            ) : (
              shown.map((food) => (
                <div
                  key={food.id}
                  className={`master-list-item${form?.id === food.id ? " selected" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Edit ${food.name}`}
                  onClick={() => openForm(foodToForm(food))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openForm(foodToForm(food));
                    }
                  }}
                >
                  <span className="master-list-item-name">{food.name}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="master-list-item-badge">
                      {food.unit_type === "per_100g" ? "Per 100g" : "Per Item"}
                    </span>
                    {/* Only the user's own foods are deletable; canonical/shared
                        foods show no delete affordance (they can't be removed). */}
                    {food.owned &&
                      (pendingDelete === food.id ? (
                        <span
                          className="delete-confirm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="delete-confirm-yes"
                            title={`Delete ${food.name}`}
                            disabled={isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(food.id);
                            }}
                          >
                            Delete
                          </button>
                          <button
                            className="delete-confirm-no"
                            title="Keep"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPendingDelete(null);
                            }}
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          className="delete-icon"
                          title="Delete food"
                          aria-label={`Delete ${food.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingDelete(food.id);
                          }}
                        >
                          ✕
                        </button>
                      ))}
                  </span>
                </div>
              ))
            )}
            {filtered.length > LIST_CAP && (
              <p className="field-hint" style={{ padding: "8px 4px" }}>
                Showing {LIST_CAP} of {filtered.length} — refine your search to narrow it down.
              </p>
            )}
          </div>
        </div>

        <div className="detail-panel" ref={detailRef}>
          {form === null ? (
            <p className="empty-state-message">
              Select a food from the list or click &lsquo;+ New Food&rsquo; to begin.
            </p>
          ) : (
            <div>
              <h2>{form.id ? "Edit Food" : "New Food"}</h2>

              <div className="form-row form-row-mb">
                <div className="compact-input" style={{ flex: 2 }}>
                  <label className="form-label">Food Name</label>
                  <input
                    type="text"
                    value={form.name}
                    placeholder="e.g. Porridge Oats"
                    autoFocus
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row form-row-mb">
                <div className="compact-input">
                  <label className="form-label">Unit Type</label>
                  <div className="radio-group" style={{ height: 36 }}>
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="unit-type"
                        checked={form.unit_type === "per_100g"}
                        onChange={() => {
                          if (form.unit_type !== "per_100g" && hasNutrientValues(form)) {
                            setBasisWarning(true);
                          }
                          setServingError(false);
                          setForm({ ...form, unit_type: "per_100g", serving_size_g: "" });
                        }}
                      />{" "}
                      Per 100g
                    </label>
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="unit-type"
                        checked={form.unit_type === "per_item"}
                        onChange={() => {
                          if (form.unit_type !== "per_item" && hasNutrientValues(form)) {
                            setBasisWarning(true);
                          }
                          setForm({ ...form, unit_type: "per_item" });
                        }}
                      />{" "}
                      Per Item
                    </label>
                  </div>
                </div>
                <div className="compact-input">
                  <label className="form-label">
                    Serving Size (g)
                    {form.unit_type === "per_item" && (
                      <span className="required-mark" title="Required"> *</span>
                    )}
                  </label>
                  <input
                    ref={servingRef}
                    type="number"
                    min={0}
                    step={0.1}
                    className={servingError ? "input-error" : undefined}
                    aria-invalid={servingError || undefined}
                    disabled={form.unit_type === "per_100g"}
                    placeholder={
                      form.unit_type === "per_item" ? "Required for per-item" : ""
                    }
                    value={form.serving_size_g}
                    onChange={(e) => {
                      setServingError(false);
                      setForm({ ...form, serving_size_g: e.target.value });
                    }}
                  />
                </div>
              </div>

              <div className="section-label">
                Nutrients ({form.unit_type === "per_100g" ? "per 100g" : "per item"})
              </div>
              {basisWarning ? (
                <p className="field-hint field-hint-warn">
                  Unit type changed — these values were <strong>not</strong> converted.
                  Re-enter them {form.unit_type === "per_100g" ? "per 100g" : "for one item"}.
                </p>
              ) : (
                <p className="field-hint">
                  A blank field is recorded as 0.
                  {form.unit_type === "per_item" && " Fields marked * are required."}
                </p>
              )}
              <div className="editor-grid">
                {NUTRIENT_KEYS.map((key) => (
                  <div key={key} className="compact-input">
                    <label className="form-label-sm">{NUTRIENT_LABELS[key]}</label>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={form.nutrients[key]}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          nutrients: { ...form.nutrients, [key]: e.target.value },
                        })
                      }
                    />
                  </div>
                ))}
              </div>

              <div className="editor-actions">
                <button className="btn-secondary" onClick={() => openForm({ ...EMPTY_FORM })}>
                  Clear
                </button>
                <button className="btn-secondary" onClick={() => setForm(null)}>
                  Cancel
                </button>
                <button className="btn-primary" onClick={handleSave} disabled={isPending}>
                  {isPending ? "Saving..." : "Save Food"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ToastContainer toasts={toasts} dismiss={dismissToast} />
    </div>
  );
}

/** True if the form has any non-blank nutrient value (so a unit flip matters). */
function hasNutrientValues(form: FormState): boolean {
  return NUTRIENT_KEYS.some((k) => form.nutrients[k].trim() !== "");
}
