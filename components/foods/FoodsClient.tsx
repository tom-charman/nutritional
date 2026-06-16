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

export default function FoodsClient({ initialFoods }: { initialFoods: FoodItem[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState | null>(null);
  const [isPending, startTransition] = useTransition();

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

  function handleSave() {
    if (!form) return;
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
        router.refresh();
      }
    });
  }

  function handleDelete(foodId: string) {
    startTransition(async () => {
      const result = await deleteFoodAction(foodId);
      pushToast(result.message, result.ok);
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
          <button className="btn-primary" onClick={() => setForm({ ...EMPTY_FORM })}>
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
                  onClick={() => setForm(foodToForm(food))}
                >
                  <span className="master-list-item-name">{food.name}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="master-list-item-badge">
                      {food.unit_type === "per_100g" ? "Per 100g" : "Per item"}
                    </span>
                    <button
                      className="delete-icon"
                      title="Delete food"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(food.id);
                      }}
                    >
                      ✕
                    </button>
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

        <div className="detail-panel">
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
                        onChange={() =>
                          setForm({ ...form, unit_type: "per_100g", serving_size_g: "" })
                        }
                      />{" "}
                      Per 100g
                    </label>
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="unit-type"
                        checked={form.unit_type === "per_item"}
                        onChange={() => setForm({ ...form, unit_type: "per_item" })}
                      />{" "}
                      Per Item
                    </label>
                  </div>
                </div>
                <div className="compact-input">
                  <label className="form-label">
                    Serving Size (g)
                    {form.unit_type === "per_item" && (
                      <span className="required-mark"> *</span>
                    )}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    disabled={form.unit_type === "per_100g"}
                    placeholder="Required for per-item"
                    value={form.serving_size_g}
                    onChange={(e) => setForm({ ...form, serving_size_g: e.target.value })}
                  />
                </div>
              </div>

              <div className="section-label">Nutrients ({form.unit_type === "per_100g" ? "per 100g" : "per item"})</div>
              <p className="field-hint">A blank field is recorded as 0.</p>
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
                <button className="btn-secondary" onClick={() => setForm({ ...EMPTY_FORM })}>
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
