const BOOL = { '1': 'true', 'true': 'true' };

NEWSCHEMA('Users/Assign', function(schema) {

	schema.define('add', '[String(50)]');
	schema.define('rem', '[String(50)]');
	schema.define('filter', 'Object');

	schema.addWorkflow('exec', function($, model) {

		if ($.controller && FUNC.notadmin($))
			return;

		var db = DBMS();

		db.log($, model);

		var builder = U.reader(REPO.users).find().fields('id,groups');

		applyfilter(builder, model.filter);

		builder.callback(function(err, response) {
			for (var i = 0; i < response.length; i++) {
				var item = response[i];
				var user = REPO.users.findItem('id', item.id);

				user.grouphash = '';

				if (model.add && model.add.length) {
					for (var j = 0; j < model.add.length; j++) {
						var group = model.add[j];
						if (user.groups.indexOf(group) === -1)
							user.groups.push(group);
					}
				}

				if (model.rem && model.rem.length) {
					for (var j = 0; j < model.rem.length; j++) {
						var group = model.rem[j];
						var index = user.groups.indexOf(group);
						if (index !== -1)
							user.groups.splice(index, 1);
					}
				}

			}

			$.success();

			FUNC.repairgroupsroles(function() {
				FUNC.refreshgroupsrolesdelay();
				FUNC.clearcache();
			});

			FUNC.save('users');
		});

	});

	function applyfilter(builder, opt) {

		opt.id && builder.in('id', opt.id);
		opt.statusid && builder.where('statusid', opt.statusid);
		opt.contractid && builder.where('contractid', +opt.contractid);
		opt.directoryid && builder.where('directoryid', opt.directoryid);
		opt.directory && builder.gridfilter('directory', opt, String);
		opt.locality && builder.gridfilter('locality', opt, String);
		opt.language && builder.gridfilter('language', opt, String);
		opt.groupid && builder.gridfilter('groupid', opt, String);
		opt.company && builder.gridfilter('company', opt, String);
		opt.gender && builder.where('gender', opt.gender);
		opt.reference && builder.gridfilter('reference', opt, String);
		opt.position && builder.gridfilter('position', opt, String);

		if (opt.photo) {
			if (BOOL[opt.photo])
				builder.contains('photo');
			else
				builder.empty('photo');
		}

		opt.supervisor && builder.gridfilter('supervisor', opt, String);
		opt.note && builder.gridfilter('note', opt, String);
		opt.dn && builder.gridfilter('dn', opt, String);
		opt.deputy && builder.gridfilter('deputy', opt, String);
		opt.desktop && builder.gridfilter('desktop', opt, Number);
		opt.inactive && builder.where('inactive', BOOL[opt.inactive] == true);

		if (opt.active) {
			buidler.or(function() {
				if (BOOL[opt.active])
					builder.where('inactive', false).where('blocked', false);
				else
					builder.where('inactive', true).where('blocked', true);
			});
		}

		opt.blocked && builder.where('blocked', BOOL[opt.blocked] == true);
		opt.darkmode && builder.where('darkmode', BOOL[opt.darkmode] == true);
		opt.sa && builder.where('sa', BOOL[opt.sa] == true);
		opt.otp && builder.where('otp', BOOL[opt.otp] == true);
		opt.online && builder.where('online', BOOL[opt.online] == true);
		opt.customer && builder.where('customer', BOOL[opt.customer] == true);
		opt.q && builder.search('search', opt.q);
		opt.name && builder.gridfilter('name', opt, String);
		opt.firstname && builder.gridfilter('firstname', opt, String);
		opt.lastname && builder.gridfilter('lastname', opt, String);
		opt.middlename && builder.gridfilter('middlename', opt, String);
		opt.phone && builder.gridfilter('phone', opt, String);
		opt.email && builder.gridfilter('email', opt, String);
		opt.group && builder.where('groups', opt.group);
		opt.ou && builder.search('ou', opt.ou);
		opt.modified && builder.where('dtmodified', '>', opt.modified);
		opt.logged && builder.where('dtlogged', '<', opt.logged);
		opt.dtupdated && builder.gridfilter('dtupdated', opt, Date);
		opt.dtcreated && builder.gridfilter('dtcreated', opt, Date);
		opt.dtmodified && builder.gridfilter('dtmodified', opt, Date);
		opt.dtlogged && builder.gridfilter('dtlogged', opt, Date);
		return builder;
	}

});