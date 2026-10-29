<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Validation messages
|--------------------------------------------------------------------------
|
| Only the rules the API actually uses; any other rule falls back to the
| framework's English text (APP_FALLBACK_LOCALE). Field names below are the
| request fields the API validates.
|
*/

return [

    'accepted' => 'Поле «:attribute» должно быть принято.',
    'after_or_equal' => 'Поле «:attribute» должно быть датой не раньше :date.',
    'alpha' => 'Поле «:attribute» может содержать только буквы.',
    'array' => 'Поле «:attribute» должно быть списком.',
    'boolean' => 'Поле «:attribute» должно быть «да» или «нет».',
    'confirmed' => 'Поле «:attribute» не совпадает с подтверждением.',
    'date' => 'Поле «:attribute» должно быть датой.',
    'date_format' => 'Поле «:attribute» должно быть датой в формате :format.',
    'distinct' => 'В поле «:attribute» есть повторяющиеся значения.',
    'email' => 'Поле «:attribute» должно быть адресом электронной почты.',
    'enum' => 'В поле «:attribute» выбрано недопустимое значение.',
    'exists' => 'Выбранное значение поля «:attribute» не найдено.',
    'file' => 'Поле «:attribute» должно быть файлом.',
    'in' => 'В поле «:attribute» выбрано недопустимое значение.',
    'integer' => 'Поле «:attribute» должно быть целым числом.',
    'list' => 'Поле «:attribute» должно быть списком с последовательными индексами.',
    'max' => [
        'array' => 'В поле «:attribute» должно быть не больше :max элементов.',
        'file' => 'Файл в поле «:attribute» должен быть не больше :max килобайт.',
        'numeric' => 'Поле «:attribute» должно быть не больше :max.',
        'string' => 'Поле «:attribute» должно быть не длиннее :max символов.',
    ],
    'min' => [
        'array' => 'В поле «:attribute» должно быть не меньше :min элементов.',
        'file' => 'Файл в поле «:attribute» должен быть не меньше :min килобайт.',
        'numeric' => 'Поле «:attribute» должно быть не меньше :min.',
        'string' => 'Поле «:attribute» должно быть не короче :min символов.',
    ],
    'present' => 'Поле «:attribute» должно присутствовать в запросе.',
    'missing_with' => 'Поле «:attribute» не должно присутствовать вместе с полем «:values».',
    'prohibited' => 'Поле «:attribute» здесь менять нельзя.',
    'required' => 'Поле «:attribute» обязательно для заполнения.',
    'required_without' => 'Поле «:attribute» обязательно, если не заполнено поле «:values».',
    'size' => [
        'array' => 'В поле «:attribute» должно быть :size элементов.',
        'file' => 'Файл в поле «:attribute» должен быть размером :size килобайт.',
        'numeric' => 'Поле «:attribute» должно быть равно :size.',
        'string' => 'Поле «:attribute» должно состоять из :size символов.',
    ],
    'string' => 'Поле «:attribute» должно быть строкой.',
    'timezone' => 'Поле «:attribute» должно быть часовым поясом.',
    'ulid' => 'Поле «:attribute» должно быть идентификатором записи.',
    'uuid' => 'Поле «:attribute» должно быть UUID уведомления.',
    'uploaded' => 'Не удалось загрузить файл в поле «:attribute».',

    'attributes' => [
        'action' => 'действие',
        'actor' => 'кто',
        'all' => 'все уведомления',
        'archived' => 'архивные',
        'birth_date' => 'дата рождения',
        'church_name' => 'название церкви',
        'contacts_public' => 'показывать контакты всем',
        'current_password' => 'текущий пароль',
        'cursor' => 'курсор',
        'default_role_id' => 'роль по умолчанию',
        'description' => 'описание',
        'email' => 'почта',
        'file' => 'файл',
        'first_name' => 'имя',
        'from' => 'с',
        'ids' => 'уведомления',
        'ids.*' => 'уведомление',
        'last_name' => 'фамилия',
        'login' => 'логин',
        'media_id' => 'файл',
        'ministry' => 'служение',
        'ministry_id' => 'служение',
        'name' => 'название',
        'note' => 'заметка',
        'page' => 'страница',
        'password' => 'пароль',
        'patronymic' => 'отчество',
        'per_page' => 'записей на странице',
        'permissions' => 'права',
        'permissions.*' => 'право',
        'person_id' => 'человек',
        'phone' => 'телефон',
        'phone_region' => 'регион телефонов',
        'purpose' => 'назначение файла',
        'remember' => 'запомнить меня',
        'role_ids' => 'роли',
        'role_ids.*' => 'роль',
        'scope' => 'уровень',
        'search' => 'поиск',
        'status' => 'статус',
        'subject_id' => 'объект',
        'subject_type' => 'вид объекта',
        'timezone' => 'часовой пояс',
        'to' => 'по',
        'without_roles' => 'без ролей',
    ],

];
