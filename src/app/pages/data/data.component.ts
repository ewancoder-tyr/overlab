import { Component, computed, inject, signal } from '@angular/core';
import { Clock } from '@shared/application/clock.service';
import { EventLog } from '@shared/application/event-log.service';
import { createBackup, parseBackup } from '@shared/domain/backup';
import { LocalText, Localized } from '@shared/domain/language';
import { LocalizePipe, translations } from '@shared/presentation/i18n';
import { downloadTextFile } from '@shared/infrastructure/file-transfer';
import { SyncService } from '@sync/application/sync.service';
import { CloudBackupComponent } from '@sync/presentation/cloud-backup/cloud-backup.component';

const TEXT = {
    en: {
        heading: 'Your data',
        intro: (count: number) =>
            `Everything is stored on this device only: ${count} events. Export regularly to keep a copy, or sign in with Google below. Importing merges a backup into what is already here and never overwrites anything.`,
        introSynced: (count: number) =>
            `${count} events on this device, backed up to your cloud copy. Exporting still gives you a file of your own. Importing merges a backup into what is already here and never overwrites anything.`,
        export: 'Export backup',
        import: 'Import backup',
        eraseConfirm: 'Tap again to erase this device',
        erase: 'Erase this device',
        eraseIntro:
            'Erasing removes everything on this device. Export a backup first if you might want it back.',
        deleteEverythingConfirm: 'Tap again to delete everything',
        deleteEverything: 'Delete everything',
        eraseSyncedIntro:
            'Erasing this device signs it out and leaves your cloud copy as it is: sign in again to get everything back. Deleting everything removes the cloud copy and the data on this device, and each of your other devices erases its own the next time it goes online.',
        exported: (count: number) => `Exported ${count} events.`,
        imported: (added: number, skipped: number) =>
            `Imported ${added} new events. ${skipped} were already here.`,
        erased: 'Everything on this device was erased.',
        erasedDevice: 'This device was erased and signed out. Your cloud copy is untouched.',
        deletedEverything:
            'Everything was deleted: the cloud copy and this device. Your other devices follow when they next go online.',
    },
    ru: {
        heading: 'Ваши данные',
        intro: (count: number) =>
            `Всё хранится только на этом устройстве: событий — ${count}. Регулярно делайте резервную копию или войдите через Google ниже. Импорт добавляет копию к тому, что уже есть, и ничего не перезаписывает.`,
        introSynced: (count: number) =>
            `Событий на этом устройстве: ${count}, все они сохраняются в вашей облачной копии. Сохранить копию в файл по-прежнему можно. Импорт добавляет копию к тому, что уже есть, и ничего не перезаписывает.`,
        export: 'Сохранить копию',
        import: 'Загрузить копию',
        eraseConfirm: 'Нажмите ещё раз, чтобы стереть устройство',
        erase: 'Стереть это устройство',
        eraseIntro:
            'Стирание удаляет всё на этом устройстве. Если данные могут ещё понадобиться, сначала сохраните копию.',
        deleteEverythingConfirm: 'Нажмите ещё раз, чтобы удалить всё',
        deleteEverything: 'Удалить всё',
        eraseSyncedIntro:
            'Стирание устройства выполняет выход и не трогает облачную копию: войдите снова, и всё вернётся. «Удалить всё» удаляет облачную копию и данные на этом устройстве, а остальные ваши устройства сотрут свои, как только выйдут в сеть.',
        exported: (count: number) => `Сохранено событий: ${count}.`,
        imported: (added: number, skipped: number) =>
            `Загружено новых событий: ${added}. Уже были здесь: ${skipped}.`,
        erased: 'Всё на этом устройстве стёрто.',
        erasedDevice: 'Устройство стёрто, выход выполнен. Облачная копия не тронута.',
        deletedEverything:
            'Всё удалено: облачная копия и это устройство. Остальные устройства сотрут свои данные, когда выйдут в сеть.',
    },
} satisfies Localized<unknown>;

/** The actions that need a confirming second tap. */
type Action = 'erase' | 'delete-everything';

/**
 * Everything about the user's data in one card: backup and restore (signed out, an exported
 * file is the only copy off the device), the Google cloud copy, and erasing.
 *
 * The cloud backup part is the `sync` context's own component; this page only places it.
 * Erasing stays here because it is about this device's log first, with the cloud copy as a
 * second step that only exists when signed in.
 *
 * The tools for trying the app out (demo data, a test date) are in Settings, under the
 * developer settings.
 */
@Component({
    selector: 'olab-data',
    imports: [CloudBackupComponent, LocalizePipe],
    templateUrl: './data.component.html',
    styleUrl: './data.component.scss',
})
export class DataComponent {
    private readonly log = inject(EventLog);
    private readonly clock = inject(Clock);
    private readonly sync = inject(SyncService);

    protected readonly t = translations(TEXT);
    protected readonly eventCount = computed(() => this.log.events().length);
    /** In every language, so a message already on screen follows a change of language. */
    protected readonly message = signal<LocalText | undefined>(undefined);
    protected readonly failed = signal(false);
    /**
     * The action waiting for its confirming second tap, if any. One signal for both buttons, so
     * arming one disarms the other and a stray tap can never confirm the wrong thing.
     */
    protected readonly armed = signal<Action | undefined>(undefined);
    /** Signed in, erasing comes in two strengths: this device only, or everything everywhere. */
    protected readonly signedIn = computed(() => this.sync.account() !== undefined);

    protected export(): void {
        // The real time, even under a test date: a backup says when it was really made.
        const now = this.clock.realTime();
        const backup = createBackup(this.log.events(), now);
        const date = now.toISOString().slice(0, 10);
        downloadTextFile(`overlab-${date}.json`, JSON.stringify(backup), 'application/json');
        const count = backup.events.length;
        this.report({ en: TEXT.en.exported(count), ru: TEXT.ru.exported(count) }, false);
    }

    protected async import(input: HTMLInputElement): Promise<void> {
        const file = input.files?.[0];
        input.value = ''; // Allow choosing the same file again later.
        if (file === undefined) {
            return;
        }

        const parsed = parseBackup(await file.text());
        if (!parsed.ok) {
            this.report(parsed.error, true);
            return;
        }
        const added = await this.log.merge(parsed.value);
        const skipped = parsed.value.length - added;
        this.report(
            { en: TEXT.en.imported(added, skipped), ru: TEXT.ru.imported(added, skipped) },
            false,
        );
    }

    /**
     * Erases this device. Signed in, that also signs it out: otherwise the next pull would bring
     * the whole cloud copy straight back.
     */
    protected async erase(): Promise<void> {
        const wasSignedIn = this.signedIn();
        if (!this.confirmed('erase')) {
            return;
        }
        await this.sync.signOut(true);
        this.report(
            wasSignedIn
                ? { en: TEXT.en.erasedDevice, ru: TEXT.ru.erasedDevice }
                : { en: TEXT.en.erased, ru: TEXT.ru.erased },
            false,
        );
    }

    /** Deletes the cloud copy and this device; other devices follow when they next sync. */
    protected async deleteEverything(): Promise<void> {
        if (!this.confirmed('delete-everything')) {
            return;
        }
        const result = await this.sync.deleteEverything();
        if (result.ok) {
            this.report({ en: TEXT.en.deletedEverything, ru: TEXT.ru.deletedEverything }, false);
        } else {
            this.report(result.error, true);
        }
    }

    /** The first tap on an action arms it and answers false; the second one confirms. */
    private confirmed(action: Action): boolean {
        if (this.armed() !== action) {
            this.armed.set(action);
            return false;
        }
        this.armed.set(undefined);
        return true;
    }

    private report(message: LocalText, failed: boolean): void {
        this.message.set(message);
        this.failed.set(failed);
    }
}
