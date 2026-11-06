import { ref, onMounted } from "vue";

export function isAndroidUserAgent(ua: string): boolean {
  return /android/i.test(ua);
}

export function useIsAndroid() {
  const isAndroid = ref(false);
  onMounted(() => {
    if (typeof navigator !== "undefined") {
      isAndroid.value = isAndroidUserAgent(navigator.userAgent);
    }
  });
  return isAndroid;
}

