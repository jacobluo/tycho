import { createRouter, createWebHistory } from "vue-router";
import WorkspaceView from "./views/WorkspaceView.vue";
import AdminLayout from "./views/AdminLayout.vue";
import ProjectManagementView from "./views/ProjectManagementView.vue";
import UserManagementView from "./views/UserManagementView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "workspace", component: WorkspaceView },
    {
      path: "/admin",
      component: AdminLayout,
      children: [
        { path: "", redirect: "/admin/projects" },
        { path: "projects", name: "admin-projects", component: ProjectManagementView },
        { path: "users", name: "admin-users", component: UserManagementView }
      ]
    }
  ]
});
