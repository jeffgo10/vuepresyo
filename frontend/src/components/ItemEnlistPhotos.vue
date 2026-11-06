<script setup lang="ts">
import { computed } from "vue";
import { MAX_ENLIST_PHOTOS } from "@/domain/enlist-item";
import { useIsAndroid } from "@/src/helpers/use-is-android";

export type PhotoEntry = {
  id: string;
  file: File;
  previewUrl: string;
};

const props = defineProps<{
  photos: PhotoEntry[];
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: "change", photos: PhotoEntry[]): void;
}>();

const isAndroid = useIsAndroid();
const canAddMore = computed(() => props.photos.length < MAX_ENLIST_PHOTOS);

function handleFiles(files: FileList | null) {
  if (!files || files.length === 0) return;
  const remainingSlots = MAX_ENLIST_PHOTOS - props.photos.length;
  if (remainingSlots <= 0) return;

  const newEntries: PhotoEntry[] = [];
  const countToAdd = Math.min(files.length, remainingSlots);

  for (let i = 0; i < countToAdd; i++) {
    const file = files[i];
    const previewUrl = URL.createObjectURL(file);
    newEntries.push({
      id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      file,
      previewUrl,
    });
  }

  emit("change", [...props.photos, ...newEntries]);
}

function handleRemove(indexToRemove: number) {
  const entryToRemove = props.photos[indexToRemove];
  if (entryToRemove) {
    URL.revokeObjectURL(entryToRemove.previewUrl);
  }
  emit(
    "change",
    props.photos.filter((_, idx) => idx !== indexToRemove),
  );
}
</script>

<template>
  <section
    class="enlist-photos-section"
    aria-labelledby="enlist-photos-heading"
  >
    <div
      style="
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 6px;
      "
    >
      <h3
        id="enlist-photos-heading"
        style="margin: 0; font-size: 14px; font-weight: 600"
      >
        Item Photos ({{ photos.length }}/{{ MAX_ENLIST_PHOTOS }})
      </h3>
      <span class="muted" style="font-size: 12px">
        Front, back, barcode, or shelf price tag
      </span>
    </div>

    <div class="enlist-photo-grid">
      <div
        v-for="(photo, index) in photos"
        :key="photo.id"
        class="enlist-photo-card"
      >
        <img
          :src="photo.previewUrl"
          :alt="`Photo ${index + 1}`"
          class="enlist-photo-thumb"
        />
        <span class="enlist-photo-badge">
          {{ index === 0 ? "Front" : `Photo ${index + 1}` }}
        </span>
        <button
          v-if="!disabled"
          type="button"
          class="enlist-photo-delete-btn"
          :aria-label="`Remove photo ${index + 1}`"
          @click="handleRemove(index)"
        >
          ✕
        </button>
      </div>

      <template v-if="canAddMore && !disabled">
        <template v-if="isAndroid">
          <label class="enlist-photo-add-tile">
            <span style="font-size: 22px" aria-hidden="true">📸</span>
            <span style="font-size: 12px; font-weight: 500">Take photo</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              :disabled="disabled"
              hidden
              @change="
                (e) => {
                  const target = e.target as HTMLInputElement;
                  handleFiles(target.files);
                  target.value = '';
                }
              "
            />
          </label>
          <label class="enlist-photo-add-tile">
            <span style="font-size: 22px" aria-hidden="true">🖼️</span>
            <span style="font-size: 12px; font-weight: 500">Choose photo</span>
            <input
              type="file"
              accept="image/*"
              multiple
              :disabled="disabled"
              hidden
              @change="
                (e) => {
                  const target = e.target as HTMLInputElement;
                  handleFiles(target.files);
                  target.value = '';
                }
              "
            />
          </label>
        </template>
        <label v-else class="enlist-photo-add-tile">
          <span style="font-size: 22px" aria-hidden="true">📷</span>
          <span style="font-size: 12px; font-weight: 500">
            {{ photos.length === 0 ? "Take / Add photo" : "+ Add photo" }}
          </span>
          <input
            type="file"
            accept="image/*"
            multiple
            :disabled="disabled"
            hidden
            @change="
              (e) => {
                const target = e.target as HTMLInputElement;
                handleFiles(target.files);
                target.value = '';
              }
            "
          />
        </label>
      </template>
    </div>

    <p
      v-if="photos.length === MAX_ENLIST_PHOTOS"
      class="muted"
      style="font-size: 12px; margin: 4px 0 0"
    >
      Maximum of {{ MAX_ENLIST_PHOTOS }} photos reached.
    </p>
  </section>
</template>

