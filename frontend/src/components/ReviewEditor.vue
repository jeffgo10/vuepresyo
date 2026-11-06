<script setup lang="ts">
import { computed, ref, watch, onMounted } from "vue";
import { useRouter, RouterLink } from "vue-router";
import { formatPeso } from "@/domain/money";
import { withRecalculatedLine } from "@/domain/normalize";
import {
  VAT_TYPES,
  type ExtractedReceipt,
  type LineFlag,
  type ReceiptLine,
  type VatType,
} from "@/domain/types";
import {
  canSaveReceipt,
  getReceiptDiscrepancy,
  validateReceipt,
} from "@/domain/validate";
import { matchStore } from "@/domain/store-matcher";
import {
  clearReviewDraft,
  readReviewDraft,
  saveReviewDraft,
} from "@/src/lib/review-draft";
import {
  refreshPriceCatalog,
  usePriceCatalog,
} from "@/src/helpers/catalog/use-price-catalog";
import { callBackendFunction, getStorageDownloadUrl } from "@/src/lib/api";
import ItemNameField from "@/src/components/ItemNameField.vue";
import StoreAutocomplete from "@/src/components/StoreAutocomplete.vue";

const FLAG_LABELS: Record<LineFlag, string> = {
  struck_through: "struck through",
  unclear_name: "check name",
  unclear_price: "check price",
  unclear_sku: "check SKU",
};

function dropFlag(flags: LineFlag[], flag: LineFlag): LineFlag[] {
  return flags.filter((entry) => entry !== flag);
}

const router = useRouter();
const { products: catalogProducts, storeNames, stores } = usePriceCatalog(
  "Could not load catalog.",
);

const receipt = ref<ExtractedReceipt | null>(null);
const imagePath = ref<string | null>(null);
const error = ref<string | null>(null);
const pending = ref(false);
const loaded = ref(false);

onMounted(() => {
  const draft = readReviewDraft();
  if (draft) {
    receipt.value = draft.receipt;
    imagePath.value = draft.imagePath ?? null;
  }
  loaded.value = true;
});

const imageUrl = computed(() =>
  imagePath.value ? getStorageDownloadUrl(imagePath.value) : null,
);

const validation = computed(() =>
  receipt.value ? validateReceipt(receipt.value) : null,
);
const saveCheck = computed(() =>
  receipt.value ? canSaveReceipt(receipt.value) : { canSave: false, reason: "" },
);
const discrepancyNote = computed(() =>
  receipt.value ? getReceiptDiscrepancy(receipt.value) : null,
);

const matchedStore = computed(() => {
  if (!receipt.value || !stores.value) return null;
  const list = Object.entries(stores.value).map(([id, rec]) => ({
    id,
    name: rec.name,
    branch: rec.branch,
  }));
  if (list.length === 0) return null;
  return matchStore(
    {
      id: receipt.value.store.id,
      name: receipt.value.store.name,
      branch: receipt.value.store.branch,
    },
    list,
  );
});

watch(
  [receipt, validation],
  ([rec, val]) => {
    if (rec && val) {
      saveReviewDraft({
        receipt: rec,
        validation: val,
        imagePath: imagePath.value,
      });
    }
  },
  { deep: true },
);

function updateLine(index: number, patch: Partial<ReceiptLine>) {
  if (!receipt.value) return;
  const items = receipt.value.items.map((line, lineIndex) => {
    if (lineIndex !== index) return line;
    let flags = line.flags;
    if (patch.name != null) flags = dropFlag(flags, "unclear_name");
    if (patch.sku != null) flags = dropFlag(flags, "unclear_sku");
    if (patch.unitPrice != null || patch.qty != null)
      flags = dropFlag(flags, "unclear_price");
    return withRecalculatedLine(line, { ...patch, flags });
  });
  receipt.value = { ...receipt.value, items };
}

function deleteLine(index: number) {
  if (!receipt.value) return;
  receipt.value = {
    ...receipt.value,
    items: receipt.value.items.filter((_, idx) => idx !== index),
  };
}

function updateStore(patch: Partial<ExtractedReceipt["store"]>) {
  if (!receipt.value) return;
  receipt.value = {
    ...receipt.value,
    store: { ...receipt.value.store, ...patch },
  };
}

function updateTotals(patch: Partial<ExtractedReceipt["totals"]>) {
  if (!receipt.value) return;
  receipt.value = {
    ...receipt.value,
    totals: { ...receipt.value.totals, ...patch },
  };
}

async function save() {
  if (!receipt.value || !saveCheck.value.canSave) return;
  pending.value = true;
  error.value = null;
  try {
    await callBackendFunction("saveReceipt", {
      receipt: receipt.value,
      imagePath: imagePath.value,
      discrepancyNote: discrepancyNote.value,
    });
    clearReviewDraft();
    await refreshPriceCatalog();
    await router.push("/");
  } catch (caught: unknown) {
    error.value =
      caught instanceof Error ? caught.message : "Could not save this receipt.";
    pending.value = false;
  }
}

const flagCount = computed(() =>
  receipt.value
    ? receipt.value.items.filter((line) => line.flags.length > 0).length
    : 0,
);
</script>

<template>
  <p v-if="!loaded" class="muted">Loading review…</p>
  <p v-else-if="!receipt || !validation" class="muted">
    Nothing to review. <RouterLink to="/scan">Scan a receipt</RouterLink> first.
  </p>
  <div v-else class="review-layout">
    <div>
      <img
        v-if="imageUrl"
        class="photo"
        :src="imageUrl"
        alt="Receipt photo"
      />
      <div v-else class="card muted">No photo for the sample receipt.</div>
    </div>

    <div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <div class="card">
        <label class="field">
          <span>Store</span>
          <StoreAutocomplete
            :value="receipt.store.name"
            :stores="stores"
            placeholder="Store name"
            @change="(name) => updateStore({ name })"
            @select-store="
              (s) => updateStore({ id: s.id, name: s.name, branch: s.branch })
            "
          />
        </label>

        <div class="grid-2" style="margin-top: 8px">
          <label class="field">
            <span>Branch</span>
            <input
              class="cell"
              :value="receipt.store.branch ?? ''"
              placeholder="e.g. Daro, Dumaguete City"
              @input="
                (e) =>
                  updateStore({
                    branch: (e.target as HTMLInputElement).value || null,
                  })
              "
            />
          </label>
          <label class="field">
            <span>Invoice</span>
            <input
              class="cell"
              :value="receipt.store.invoiceNo ?? ''"
              @input="
                (e) =>
                  updateStore({
                    invoiceNo: (e.target as HTMLInputElement).value || null,
                  })
              "
            />
          </label>
        </div>

        <div
          v-if="matchedStore?.isExisting"
          style="
            font-size: 12px;
            color: var(--brand, #0d7a5f);
            margin-top: 6px;
            display: flex;
            align-items: center;
            gap: 4px;
          "
        >
          <span>
            ✓ Matched existing store:
            <strong>{{ matchedStore.name }}</strong
            >{{ matchedStore.branch ? ` (${matchedStore.branch})` : "" }}
          </span>
        </div>
        <div
          v-else-if="receipt.store.name"
          style="font-size: 12px; color: var(--muted, #666); margin-top: 6px"
        >
          <span>
            ℹ Will register as new store:
            <strong>{{ receipt.store.name }}</strong
            >{{ receipt.store.branch ? ` (${receipt.store.branch})` : "" }}
          </span>
        </div>

        <div class="grid-2">
          <label class="field">
            <span>Date</span>
            <input
              class="cell"
              type="date"
              :value="receipt.store.date"
              @input="
                (e) =>
                  updateStore({ date: (e.target as HTMLInputElement).value })
              "
            />
          </label>
          <label class="field">
            <span>Time</span>
            <input
              class="cell"
              type="time"
              :value="receipt.store.time ?? ''"
              @input="
                (e) =>
                  updateStore({
                    time: (e.target as HTMLInputElement).value || null,
                  })
              "
            />
          </label>
        </div>

        <div>
          <span v-if="flagCount > 0" class="pill warn">
            {{ flagCount }} lines need a look
          </span>
          {{ " " }}
          <span v-if="validation.ok" class="pill ok">Totals match</span>
          <span v-else class="pill warn">Discrepancy noted</span>
        </div>
      </div>

      <div class="card">
        <div class="muted" style="margin-bottom: 6px">Items</div>
        <div
          v-for="(line, index) in receipt.items"
          :key="`${line.rawName}-${index}`"
          class="line-edit"
        >
          <div
            v-if="line.lineTotal === 0 || line.unitPrice === 0"
            class="line-edit-zero-bar"
          >
            <span class="line-edit-zero-tag">₱0 item (e.g. bag)</span>
            <button
              type="button"
              class="btn-line-delete"
              @click="deleteLine(index)"
            >
              Delete item
            </button>
          </div>

          <label class="field">
            <span>Item name</span>
            <ItemNameField
              :value="line.name"
              :sku="line.sku"
              :products="catalogProducts"
              :store-names="storeNames"
              placeholder="Product name"
              @change="(name) => updateLine(index, { name })"
              @select-suggestion="
                (s) =>
                  updateLine(index, {
                    name: s.name,
                    sku: s.sku ?? line.sku,
                    unit: s.unit,
                    productId: s.productId,
                    linkedItemKey: s.itemKey,
                  })
              "
            />
          </label>

          <label class="field">
            <span>SKU</span>
            <input
              class="cell"
              :value="line.sku ?? ''"
              @input="
                (e) =>
                  updateLine(index, {
                    sku: (e.target as HTMLInputElement).value || null,
                  })
              "
            />
          </label>

          <div class="grid-2">
            <label class="field">
              <span>Qty</span>
              <input
                class="cell"
                type="number"
                min="0"
                step="0.001"
                :value="line.qty"
                @input="
                  (e) =>
                    updateLine(index, {
                      qty: Number((e.target as HTMLInputElement).value),
                    })
                "
              />
            </label>
            <label class="field">
              <span>Unit price</span>
              <input
                class="cell"
                type="number"
                min="0"
                step="0.01"
                :value="line.unitPrice"
                @input="
                  (e) =>
                    updateLine(index, {
                      unitPrice: Number((e.target as HTMLInputElement).value),
                    })
                "
              />
            </label>
          </div>

          <div class="row" style="border: 0; padding-top: 0">
            <label class="field" style="margin: 0; flex: 1">
              <span>VAT</span>
              <select
                class="cell"
                :value="line.vatType ?? ''"
                @change="
                  (e) =>
                    updateLine(index, {
                      vatType: ((e.target as HTMLSelectElement).value ||
                        null) as VatType | null,
                    })
                "
              >
                <option value="">Unknown</option>
                <option
                  v-for="vatType in VAT_TYPES"
                  :key="vatType"
                  :value="vatType"
                >
                  {{ vatType }}
                </option>
              </select>
            </label>
            <div style="text-align: right">
              <div class="name">{{ formatPeso(line.lineTotal) }}</div>
              <div class="muted">
                {{ line.qty }} × {{ formatPeso(line.unitPrice) }}
              </div>
            </div>
          </div>

          <div style="display: flex; gap: 6px; flex-wrap: wrap">
            <span v-for="flag in line.flags" :key="flag" class="pill warn">
              {{ FLAG_LABELS[flag] }}
            </span>
          </div>
        </div>
      </div>

      <div class="card">
        <label class="field">
          <span>VATable net</span>
          <input
            class="cell"
            type="number"
            step="0.01"
            :value="receipt.totals.vatableNet ?? ''"
            @input="
              (e) => {
                const v = (e.target as HTMLInputElement).value;
                updateTotals({ vatableNet: v === '' ? null : Number(v) });
              }
            "
          />
        </label>
        <label class="field">
          <span>VAT-exempt</span>
          <input
            class="cell"
            type="number"
            step="0.01"
            :value="receipt.totals.vatExemptSales"
            @input="
              (e) =>
                updateTotals({
                  vatExemptSales: Number((e.target as HTMLInputElement).value),
                })
            "
          />
        </label>
        <label class="field">
          <span>VAT 12% (included)</span>
          <input
            class="cell"
            type="number"
            step="0.01"
            :value="receipt.totals.vat ?? ''"
            @input="
              (e) => {
                const v = (e.target as HTMLInputElement).value;
                updateTotals({ vat: v === '' ? null : Number(v) });
              }
            "
          />
        </label>
        <label class="field">
          <span>Total</span>
          <input
            class="cell"
            type="number"
            step="0.01"
            :value="receipt.totals.total"
            @input="
              (e) =>
                updateTotals({
                  total: Number((e.target as HTMLInputElement).value),
                })
            "
          />
        </label>

        <div
          v-if="discrepancyNote"
          style="
            margin-top: 8px;
            padding: 8px 12px;
            background: rgba(245, 158, 11, 0.08);
            border: 1px solid var(--warn, #f59e0b);
            border-radius: 6px;
          "
        >
          <div
            style="
              display: flex;
              align-items: center;
              gap: 4px;
              font-weight: 600;
              color: var(--warn, #f59e0b);
              font-size: 12px;
              margin-bottom: 2px;
            "
          >
            <span>⚠️</span> Total Discrepancy Note
          </div>
          <p style="margin: 2px 0; font-size: 12px">{{ discrepancyNote }}</p>
          <p class="muted" style="margin: 4px 0 0; font-size: 11px">
            This receipt can still be saved. This discrepancy will be logged in
            the receipt details.
          </p>
        </div>

        <p
          v-if="!saveCheck.canSave && saveCheck.reason"
          class="error"
          role="alert"
        >
          {{ saveCheck.reason }}
        </p>
      </div>

      <button
        class="btn"
        type="button"
        :disabled="!saveCheck.canSave || pending"
        @click="save"
      >
        {{
          pending
            ? "Saving…"
            : validation.ok
            ? "Confirm and save"
            : "Confirm and save (with discrepancy note)"
        }}
      </button>
    </div>
  </div>
</template>

