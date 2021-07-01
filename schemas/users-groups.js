NEWSCHEMA('Users/Groups', function(schema) {

	schema.define('id', 'String(50)');
	schema.define('name', 'String(50)');
	schema.define('note', 'String(200)');
	schema.define('apps', '[Object]'); // [{ id: UID, roles: [] }]

	schema.setQuery(function($) {

		if ($.controller && FUNC.notadmin($))
			return;

		var arr = [];

		for (var i = 0; i < MAIN.groups.length; i++) {
			var group = MAIN.groups[i];
			var obj = {};
			obj.id = group.id;
			obj.name = group.name;
			obj.dtcreated = group.dtcreated;
			obj.dtupdated = group.dtupdated;
			obj.note = group.note;
			obj.apps = [];
			obj.count = 0;

			for (var j = 0; j < group.apps.length; j++) {
				var appid = group.apps[j];
				obj.apps.push({ id: appid, roles: group.appsroles[appid] || EMPTYARRAY });
			}

			arr.push(obj);
		}

		for (var i = 0; i < REPO.groups_apps.length; i++) {
			var ga = REPO.groups_apps[i];
			var g = arr.findItem('id', ga.groupid);
			if (g)
				g.count++;
		}

		$.callback(arr);
	});

	schema.setPatch(function($, model) {

		if ($.controller && FUNC.notadmin($))
			return;

		var id = model.id || UID();
		var insert = false;
		var apps = model.apps;

		// TMS
		var publish = {};
		var publish_name;
		publish.id = model.id;
		publish.name = model.name;
		publish.note = model.note;
		publish.apps = apps.map(app => app.id);
		publish_name = 'groups_update';
		publish.dtupdated = NOW;

		model.id = id;
		model.apps = undefined;
		model.dtupdated = NOW;

		var save = ['groups'];

		$.extend && $.extend(model);

		var group = REPO.groups.findItem('id', id);
		if (group) {

			group.name = model.name;
			group.dtupdated = NOW;

			var is = false;

			for (var i = 0; i < REPO.users.length; i++) {
				var item = REPO.users[i];
				if (item.groups.indexOf(id) !== -1) {
					item.dtmodified = NOW;
					is = true;
				}
			}

			is && save.push('users');

		} else {
			publish_name = 'groups_create';
			publish.dtcreated = NOW;
			publish.dtupdated = undefined;

			model.dtupdated = undefined;
			model.dtcreated = NOW;
			REPO.groups.push(model);
		}

		PUBLISH(publish_name, FUNC.tms($, publish));

		if (apps) {

			save.push('groups_apps');
			REPO.groups_apps = REPO.groups_apps.remove('groupid', id);

			for (var i = 0; i < apps.length; i++) {
				var appmeta = apps[i];
				if (appmeta && appmeta.id) {
					var appid = appmeta.id;
					var app = MAIN.apps.findItem('id', appmeta.id);
					app && REPO.groups_apps.push({ id: id + appid, groupid: id, appid: appid, roles: appmeta.roles });
				}
			}
		}

		DBMS().log($, model, model.name);

		FUNC.refreshgroupsroles(function() {
			FUNC.refreshmeta($.done(id));
			FUNC.clearcache();
			EMIT('groups/' + (insert ? 'create' : 'udpate'), id);
		});

		FUNC.save.apply(this, save);
	});

	schema.setRemove(function($) {

		if ($.controller && FUNC.notadmin($))
			return;

		var id = $.query.id;
		var group = MAIN.groupscache[id];
		if (!group) {
			$.error.replace('@', id);
			$.invalid('error-users-group');
			return;
		}

		REPO.groups.remove('id', id);
		REPO.groups_apps.remove('groupid', id);
		DBMS().log($, null, group.name);

		FUNC.save('groups', 'groups_apps');

		FUNC.refreshgroupsroles(function() {
			PUBLISH('groups_remove', FUNC.tms($, { id: id }));
			FUNC.refreshmeta($.done());
			EMIT('groups/remove', id);
		});
	});

});