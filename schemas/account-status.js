const STATUS = {
	'0': 'Available',
	'1': 'Busy',
	'2': 'Do not disturb',
	'3': 'Be right back',
	'4': 'Meeting',
	'5': 'Business trip',
	'6': 'Holiday',
	'7': 'Sick',
	'8': 'Off work'
};

NEWSCHEMA('Account/Status', function(schema) {

	schema.define('statusid', Number);
	schema.define('status', 'String(70)');

	schema.setSave(function($, model) {

		if ($.user.guest) {
			$.invalid('error-permissions');
			return;
		}

		if (model.statusid > 7) {
			$.invalid('statusid');
			return;
		}

		var item = REPO.users.findItem('id', $.user.id);

		model.dtmodified = NOW;
		model.dtupdated = NOW;

		item.statusid = $.user.statusid = model.statusid;
		item.status = $.user.status = model.status;
		item.dtupdated = $.user.dtupdated = NOW;
		item.dtmodified = $.user.dtmodified = NOW;

		$.extend && $.extend(model);
		DBMS().log($, model, STATUS[model.statusid + '']);
		EMIT('account/update', $.user.id);
		MAIN.session.refresh($.user.id, $.sessionid);
		FUNC.save('users');
		$.success();
	});

});