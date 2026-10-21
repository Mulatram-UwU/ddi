import { api, errorMessageKey } from '../api';
import type { AppContext } from '../app-context';
import { html, mustFind } from '../dom';
import { t } from '../i18n';
import type { MessageKey } from '../locales/en-US';
import type { AdminModelJson } from '../types';
import { escapeHtml } from '../util';

interface FormState {
  editing: string | null;
}

export async function adminView(ctx: AppContext): Promise<HTMLElement> {
  ctx.setTitle('title.admin');

  if (!ctx.me?.is_admin) {
    return html(`
      <div>
        <h1>${escapeHtml(t('admin.title'))}</h1>
        <div class="banner error">${escapeHtml(t('admin.needs_admin'))}</div>
      </div>
    `);
  }

  const root = html(`
    <div>
      <h1>${escapeHtml(t('admin.title'))}</h1>
      <div class="banner error admin-banner" hidden></div>
      <div class="banner info admin-note" hidden></div>

      <section class="card">
        <h2 class="form-title"></h2>
        <form class="model-form">
          <div class="form-grid">
            <div class="field"><label for="f-slug">${escapeHtml(t('admin.slug'))}</label><input id="f-slug" name="slug" required /></div>
            <div class="field"><label for="f-name">${escapeHtml(t('admin.name'))}</label><input id="f-name" name="name" required /></div>
            <div class="field"><label for="f-provider">${escapeHtml(t('admin.provider'))}</label><input id="f-provider" name="provider" required /></div>
            <div class="field"><label for="f-homepage">${escapeHtml(t('admin.homepage_url'))}</label><input id="f-homepage" name="homepage_url" /></div>
            <div class="field"><label for="f-active">${escapeHtml(t('admin.is_active'))}</label><input id="f-active" name="is_active" type="checkbox" checked /></div>
          </div>
          <div class="field"><label for="f-description">${escapeHtml(t('admin.description'))}</label><textarea id="f-description" name="description" rows="2"></textarea></div>
          <div class="actions">
            <button type="submit" class="primary submit-form"></button>
            <button type="button" class="cancel-edit" hidden>${escapeHtml(t('common.cancel'))}</button>
            <button type="button" class="rescore">${escapeHtml(t('admin.rescore'))}</button>
          </div>
        </form>
      </section>

      <section class="card">
        <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>${escapeHtml(t('admin.slug'))}</th>
              <th>${escapeHtml(t('admin.name'))}</th>
              <th>${escapeHtml(t('admin.provider'))}</th>
              <th>${escapeHtml(t('admin.is_active'))}</th>
              <th>${escapeHtml(t('admin.actions'))}</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
        </div>
      </section>
    </div>
  `);

  const banner = mustFind<HTMLElement>(root, '.admin-banner');
  const note = mustFind<HTMLElement>(root, '.admin-note');
  const tbody = mustFind<HTMLElement>(root, 'tbody');
  const form = mustFind<HTMLFormElement>(root, '.model-form');
  const formTitle = mustFind<HTMLElement>(root, '.form-title');
  const submitButton = mustFind<HTMLButtonElement>(root, '.submit-form');
  const cancelButton = mustFind<HTMLButtonElement>(root, '.cancel-edit');
  const state: FormState = { editing: null };

  const showError = (error: unknown) => {
    banner.hidden = false;
    banner.textContent = t(errorMessageKey(error) as MessageKey);
  };

  const field = (name: string): HTMLInputElement | HTMLTextAreaElement =>
    mustFind<HTMLInputElement | HTMLTextAreaElement>(form, `[name="${name}"]`);

  const resetForm = () => {
    state.editing = null;
    form.reset();
    mustFind<HTMLInputElement>(form, '[name="is_active"]').checked = true;
    formTitle.textContent = t('admin.new');
    submitButton.textContent = t('common.create');
    cancelButton.hidden = true;
    mustFind<HTMLInputElement>(form, '[name="slug"]').disabled = false;
  };

  const drawRows = (models: AdminModelJson[]) => {
    tbody.innerHTML = models
      .map(
        (model) => `
        <tr class="${model.is_active ? '' : 'inactive'}">
          <td>${escapeHtml(model.slug)}</td>
          <td>${escapeHtml(model.name)}</td>
          <td>${escapeHtml(model.provider)}</td>
          <td>${model.is_active ? '✓' : '✗'}</td>
          <td class="actions">
            <button class="edit" data-slug="${escapeHtml(model.slug)}">${escapeHtml(t('common.edit'))}</button>
            <button class="delete" data-slug="${escapeHtml(model.slug)}" data-name="${escapeHtml(model.name)}">${escapeHtml(t('common.delete'))}</button>
          </td>
        </tr>`,
      )
      .join('');
  };

  const reload = async () => {
    try {
      const response = await api.adminModels();
      drawRows(response.models);
    } catch (error) {
      showError(error);
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void (async () => {
      banner.hidden = true;
      note.hidden = true;
      const payload: Record<string, unknown> = {
        name: field('name').value.trim(),
        provider: field('provider').value.trim(),
        description: field('description').value.trim(),
        homepage_url: field('homepage_url').value.trim(),
        is_active: mustFind<HTMLInputElement>(form, '[name="is_active"]').checked,
      };
      try {
        if (state.editing) {
          await api.updateModel(state.editing, payload);
        } else {
          await api.createModel({ ...payload, slug: field('slug').value.trim() });
        }
        resetForm();
        await reload();
      } catch (error) {
        showError(error);
      }
    })();
  });

  cancelButton.addEventListener('click', resetForm);

  mustFind<HTMLButtonElement>(root, '.rescore').addEventListener('click', () => {
    void (async () => {
      banner.hidden = true;
      note.hidden = true;
      try {
        const result = await api.rescore();
        note.hidden = false;
        note.textContent = t('admin.rescore_done', { count: result.models });
        await reload();
      } catch (error) {
        showError(error);
      }
    })();
  });

  tbody.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const slug = target.dataset.slug;
    if (!slug) return;
    if (target.classList.contains('delete')) {
      const name = target.dataset.name ?? slug;
      if (!window.confirm(t('admin.confirm_delete', { name }))) return;
      void (async () => {
        try {
          await api.deleteModel(slug);
          if (state.editing === slug) resetForm();
          await reload();
        } catch (error) {
          showError(error);
        }
      })();
      return;
    }
    if (target.classList.contains('edit')) {
      void (async () => {
        try {
          const response = await api.adminModels();
          const model = response.models.find((candidate) => candidate.slug === slug);
          if (!model) return;
          state.editing = model.slug;
          field('slug').value = model.slug;
          field('slug').disabled = true;
          field('name').value = model.name;
          field('provider').value = model.provider;
          field('description').value = model.description ?? '';
          field('homepage_url').value = model.homepage_url ?? '';
          mustFind<HTMLInputElement>(form, '[name="is_active"]').checked = model.is_active === 1;
          formTitle.textContent = `${t('common.edit')}: ${model.name}`;
          submitButton.textContent = t('common.save');
          cancelButton.hidden = false;
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (error) {
          showError(error);
        }
      })();
    }
  });

  resetForm();
  await reload();
  return root;
}
