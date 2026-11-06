import { createRouter, createWebHistory } from "vue-router";
import HomeView from "@/src/views/HomeView.vue";
import LoginView from "@/src/views/LoginView.vue";
import ScanView from "@/src/views/ScanView.vue";
import ReviewView from "@/src/views/ReviewView.vue";
import CompareView from "@/src/views/CompareView.vue";
import ItemsView from "@/src/views/ItemsView.vue";
import EnlistItemView from "@/src/views/EnlistItemView.vue";
import StoresView from "@/src/views/StoresView.vue";
import ReceiptsView from "@/src/views/ReceiptsView.vue";
import ReceiptDetailView from "@/src/views/ReceiptDetailView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: HomeView },
    { path: "/login", component: LoginView },
    { path: "/scan", component: ScanView },
    { path: "/review", component: ReviewView },
    { path: "/compare", component: CompareView },
    { path: "/items", component: ItemsView },
    { path: "/items/enlist", component: EnlistItemView },
    { path: "/stores", component: StoresView },
    { path: "/receipts", component: ReceiptsView },
    { path: "/receipts/detail", component: ReceiptDetailView },
  ],
});

