<?php

declare(strict_types=1);

namespace App\Modules\Access;

enum Permission: string
{
    case PeopleView = 'people.view';
    case PeopleViewContacts = 'people.view_contacts';
    case PeopleViewNotes = 'people.view_notes';
    case PeopleManage = 'people.manage';
    case PeopleInvite = 'people.invite';
    case MinistriesCreate = 'ministries.create';
    case MinistriesViewAll = 'ministries.view_all';
    case MinistriesManageAll = 'ministries.manage_all';
    case RolesManageGlobal = 'roles.manage_global';
    case SettingsManage = 'settings.manage';
    case AuditView = 'audit.view';

    case MembersManage = 'members.manage';
    case MembersViewContacts = 'members.view_contacts';
    case RolesManage = 'roles.manage';
    case MinistryEdit = 'ministry.edit';

    public function scope(): PermissionScope
    {
        return match ($this) {
            self::MembersManage, self::MembersViewContacts,
            self::RolesManage, self::MinistryEdit => PermissionScope::Ministry,
            default => PermissionScope::Global,
        };
    }

    public function label(): string
    {
        return match ($this) {
            self::PeopleView => 'Видеть справочник',
            self::PeopleViewContacts => 'Видеть контакты',
            self::PeopleViewNotes => 'Видеть заметки',
            self::PeopleManage => 'Управлять людьми',
            self::PeopleInvite => 'Приглашать',
            self::MinistriesCreate => 'Создавать служения',
            self::MinistriesViewAll => 'Видеть все служения',
            self::MinistriesManageAll => 'Управлять всеми служениями',
            self::RolesManageGlobal => 'Управлять глобальными ролями',
            self::SettingsManage => 'Настройки церкви',
            self::AuditView => 'Журнал действий',
            self::MembersManage => 'Управлять составом',
            self::MembersViewContacts => 'Контакты участников',
            self::RolesManage => 'Управлять ролями служения',
            self::MinistryEdit => 'Редактировать служение',
        };
    }

    public function description(): string
    {
        return match ($this) {
            self::PeopleView => 'Список людей и карточка: ФИО, фото, статус, служения.',
            self::PeopleViewContacts => 'Телефон, почта и дата рождения любого человека.',
            self::PeopleViewNotes => 'Заметки руководства о людях.',
            self::PeopleManage => 'Создавать, редактировать и архивировать людей, менять ФИО и статус, стирать данные.',
            self::PeopleInvite => 'Создавать приглашения и ссылки сброса пароля, отключать и включать аккаунты.',
            self::MinistriesCreate => 'Создание и архивация служений.',
            self::MinistriesViewAll => 'Состав, события и объявления любого служения без участия в нём.',
            self::MinistriesManageAll => 'Все внутренние права в каждом служении.',
            self::RolesManageGlobal => 'Редактор глобальных ролей и выдача их людям.',
            self::SettingsManage => 'Название церкви, часовой пояс, регион телефонов.',
            self::AuditView => 'Хронология административных действий.',
            self::MembersManage => 'Добавлять и исключать участников, выдавать и снимать роли служения.',
            self::MembersViewContacts => 'Телефон, почта и дата рождения участников этого служения.',
            self::RolesManage => 'Создавать, редактировать и удалять роли служения, выбирать роль по умолчанию.',
            self::MinistryEdit => 'Название, описание и обложка служения.',
        };
    }

    /** @return list<self> */
    public static function ofScope(PermissionScope $scope): array
    {
        return array_values(array_filter(
            self::cases(),
            fn (self $permission): bool => $permission->scope() === $scope,
        ));
    }
}
