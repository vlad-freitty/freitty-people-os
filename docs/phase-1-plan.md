# Фаза 1 — Request engine: план і зміни схеми (на погодження)

21.10.2026 · за PRD розділи 4, 8 · статус: **погоджено 21.10.2026 (усі 6 рекомендацій), реалізовано**

## 1. Що входить і критерії готовності

**Обсяг (PRD 8):** конструктор шаблонів (draft → publish, версії), усі `step_type` і `assignee_rule`, kinds
`generic / hiring / onboarding / access / offboarding`, довідники System, AccessBundle, AccessGrant, Asset, Document,
сторінка «Мої задачі», нагадування про випробувальний термін на дашборді.

**Не входить:** kinds `absence` (фаза 2) і `bonus` (фаза 3). Їх значення вже будуть в enum, але конструктор
їх не дозволить, доки немає їхніх сутностей. Стартові шаблони 5 (відпустка) і 6 (премія) з'являться у фазах 2 і 3.
Telegram і нотифікації — фаза 5.

**Готово, коли (автотести):**
1. Онбординг проходить від початку до кінця. NDA завантажується в Document співробітника, крок `child_request` запускає дочірній ARM із системами з шаблону доступів посади. ARM створює AccessGrant, після цього закривається батьківський крок, а співробітник стає `active` з відліком випробувального.
2. Офбординг відкликає всі AccessGrant, повертає всю техніку, ставить статус `left` і деактивує вхід.
3. Публікація v2 шаблону не змінює кроки заявок, створених на v1.
4. Керівник відділу не бачить шаблони й заявки чужого відділу: API віддає 404.

Плюс unit-тести: SLA у робочих днях, призначення виконавця, `on_reject` з поверненням на групу, паралельні кроки в групі.

## 2. Зміни схеми

Сутності — ті, що названі в PRD 3–4. Окремо позначено **[тех]** — технічні поля, без яких не працює рушій, і
**[нове]** — те, чого в PRD немає, потребує вашого «так».

### 2.1 Доступи, техніка, документи

```text
System            id, name (unique), owner_employee_id?, is_active [тех]
AccessBundle      id, name («CS agent»), position_or_role
AccessBundleItem  bundle_id, system_id, access_level            PK(bundle_id, system_id)
AccessGrant       id, employee_id, system_id, access_level, granted_at, revoked_at?, request_id?
                  [тех] одна активна видача на (employee, system) — partial unique index WHERE revoked_at IS NULL
Asset             id, type (laptop/phone/license/other), name, serial_or_seat, monthly_cost?,
                  currency [тех, для підсумку вартості ліцензій], assigned_to?, assigned_at?, returned_at?
Document          id, employee_id, type (contract/nda/act/invoice/w9/other), file, period?, valid_from?, valid_to?,
                  status (active/expired/archived)
                  file = [тех] file_key, file_name, mime_type, size; request_id? [тех] — з якої заявки прийшов
```

### 2.2 Request engine

```text
RequestType          id, code (unique), name_uk, name_en?, kind, department_id? (null = глобальний),
                     who_can_initiate JSON {mode: all|departments|roles, department_ids[], role_codes[]},
                     current_version_id?
RequestTypeVersion   id, request_type_id, version, status (draft/published/archived), published_by?, published_at?
                     UNIQUE(request_type_id, version); опублікована версія незмінна
FormField            id, version_id, key, label_uk, label_en?, type, options?, required, order
                     type: text/textarea/number/date/date_range/select/multiselect/person/file + systems [нове, див. 4.3]
StepTemplate         id, version_id, order_group, name_uk, name_en?, step_type, assignee_rule, assignee_value?,
                     sla_days, checklist[]?, required_fields[]?, on_reject JSON {action: close|return, group?},
                     child_request_type_id? [тех, для child_request]
Request              id, number [тех, людський номер REQ-0001], request_type_version_id, initiator_id (Employee),
                     subject_employee_id?, status (draft/in_progress/done/rejected/cancelled), current_group,
                     department_id [тех, для scope], parent_step_id? [тех, зв'язок дочірньої заявки], completed_at? [тех]
RequestFieldValue    request_id, field_key, value JSON              PK(request_id, field_key)
StepInstance         id, request_id, step_template_id, assignee_id? (Employee),
                     status (waiting/active/needs_assignment [тех, «потрібне призначення»]/done/rejected/skipped),
                     due_at?, completed_at?, comment?, attachments[]
                     [тех] order_group, system_id? (розгортання «по кроку на систему»), activated_at, completed_by,
                     checklist_state JSON, child_request_id?
Comment              id, request_id, author_id, body, created_at
```

Виконавці й ініціатори — це **Employee**, а не User, бо правила призначення оперують людьми й відділами.
Людина без профілю співробітника не може ініціювати заявку чи виконувати крок.

### 2.3 Нові права в каталозі ролей

| Право | Обсяги | Навіщо |
|---|---|---|
| `requests.view` | all / departments / self | Бачити заявки. self = я ініціатор, суб'єкт або виконавець кроку |
| `systems.manage` | all | Довідник систем і шаблонів доступів |
| `assets.manage` | all | Облік техніки й ліцензій |

`templates.manage`, `templates.publish`, `requests.initiate`, `steps.reassign` уже є з фази 0. Документи співробітника
захищає наявне `employees.view_sensitive` (PRD 2: документи — чутливі поля).

## 3. Як працює рушій

- **Старт заявки:** перевіряємо `who_can_initiate` і обов'язкові поля, далі фіксуємо `request_type_version_id` і активуємо групу 1.
- **Група:** кроки однієї групи активуються разом. Коли всі закриті (`done` або `skipped`), стартує наступна група. Остання закрита група означає завершення заявки, і в тій самій транзакції виконується дія kind.
- **Призначення (`assignee_rule`):**
  - `person` — конкретна людина;
  - `initiator_dept_head` / `subject_dept_head` — керівник відділу ініціатора / співробітника, а якщо їх кілька, то найменш завантажений;
  - `system_owner` — крок розгортається в N інстансів, по одному на кожну систему з поля `systems`, і всі вони паралельні;
  - `role_first_free` — людина з указаною роллю з найменшою кількістю активних кроків.

  Якщо правило не знайшло людину, крок отримує статус `needs_assignment` і з'являється на дашборді суперадміна.
- **Типи кроків:**
  - `approve`: «погодити» або «відхилити», коментар обов'язковий при відхиленні;
  - `task`: закривається, коли відмічено всі пункти чекліста;
  - `fill`: заповнити `required_fields`;
  - `document`: файл одразу створює Document співробітника;
  - `child_request`: створює дочірню заявку (для онбордингу ARM із системами з AccessBundle за посадою); батьківський крок закривається, коли закрито дочірню.
- **Відхилення:** `close` — заявка стає `rejected`. `return` — кроки вказаної групи й пізніших скидаються в `waiting`, і робота стартує з неї знову.
- **SLA:** `due_at` = активація + `sla_days` робочих днів у таймзоні локації виконавця. У фазі 1 робочий тиждень — Пн–Пт без свят. Свята й WorkWeek підключаться у фазі 2 без зміни інтерфейсу. Прострочені кроки підсвічуються.
- **Перепризначення:** з правом `steps.reassign` (суперадмін — будь-який крок, керівник — у заявках свого відділу). Записується в audit log.
- **Конкурентність:** кожен перехід статусу виконується в транзакції з `SELECT … FOR UPDATE` на заявці, щоб два паралельні кроки не запустили наступну групу двічі.
- **Конструктор:** редагування опублікованого шаблону створює нову чернетку-копію. Публікація робить її current, а попередня версія стає archived. Перед публікацією валідація: для kind є всі обов'язкові поля, кожен крок має виконавця і SLA, `return` вказує на попередню групу, у `child_request` вказаний тип.

### Дії kind при завершенні

| kind | Поля форми (ключі) | Дія |
|---|---|---|
| generic | — | немає |
| hiring | `position`, `department`, `budget`, `desired_date` + `candidate_first_name`, `candidate_last_name`, `candidate_email` [нове] | створює Employee зі статусом candidate |
| onboarding | `employee` | статус `active`; якщо `hire_date` порожня — дата завершення; `probation_end` = hire_date + 90 днів, якщо не задано |
| access | `employee`, `systems` (системи + рівні) | створює або змінює AccessGrant |
| offboarding | `employee`, `last_day` | відкликає всі AccessGrant, повертає Asset, статус `left`, деактивує User |

Поля кандидата потрібні, бо без імені та email не можна створити Employee. Їх заповнює крок «кандидат обраний» (fill).

## 4. Рішення, які потрібні від вас

1. **Публікація шаблонів відділу.** За PRD керівник публікує сам. Пропоную залишити так, з записом в audit log.
2. **Хто такі «HR», «Legal», «Фінанси», «Адмін» у стартових шаблонах.** Пропоную системні ролі `hr`, `legal`, `finance`, `office_admin`: права як у `user`, але з ними працює правило `role_first_free`. Обмеження: у людини одна роль, тому керівник-HR отримає окрему роль на кшталт «HR + керівник».
3. **Поле `systems`** (новий тип поля): список систем із рівнем доступу для кожної. Без нього ARM не задати формою.
4. **Випробувальний термін:** 90 днів за замовчуванням, з ручною правкою `probation_end` у профілі. Нагадування на дашборді за 30, 60 і 90 днів від дати найму.
5. **Офбординг:** статус `offboarding` ставимо при старті заявки, щоб людину було видно в процесі (PRD фіксує лише кінцевий `left`).
6. **Файли:** локальна папка `.uploads/` у dev, S3-сумісне сховище в prod за інтерфейсом `Storage`. Посилання тимчасові, 5 хвилин. Провайдера bucket вирішує Сергій разом із хостингом.

**Відкриті питання з PRD (не блокують старт):**
- справжній перелік систем і власників — поки seed із фейковими власниками;
- скільки зберігаємо дані після `left` (Legal) — у фазі 1 лише soft delete, без автоочищення.

## 5. Порядок робіт

1. Міграція: схема 2.1–2.3, нові права, системні ролі HR/Legal/Finance/Office admin.
2. Довідники: System, AccessBundle, Asset (сервіси, API, сторінки), вкладки «Доступи / Техніка / Документи» у профілі.
3. Документи: сховище файлів, завантаження, тимчасові посилання, дати дії.
4. Рушій: старт, групи, призначення, типи кроків, відхилення, SLA, перепризначення, дії kind; unit-тести.
5. Конструктор шаблонів: поля, групи кроків, порядок стрілками, draft → publish, історія версій, валідація.
6. UI заявок: список, створення за типом, картка заявки з кроками й коментарями, «Мої задачі».
7. Seed стартових шаблонів 1–4 (ARM, офбординг, пошук працівника, онбординг) і фейкових систем.
8. Дашборд: мої задачі, прострочені кроки, `needs_assignment` для суперадміна, випробувальні 30/60/90.
9. Acceptance-тести з розділу 1, оновлення CLAUDE.md.
