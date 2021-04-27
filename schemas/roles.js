NEWSCHEMA('Roles', function(schema) {

	schema.setQuery(function($) {

		if ($.controller && FUNC.notadmin($))
			return;

		var roles = {};
		for (var i = 0; i < REPO.users_apps.length; i++) {
			var item = REPO.users_apps[i];
			for (var j = 0; j < item.roles.length; j++) {
				var r = item.roles[j];
				if (roles[r])
					roles[r]++;
				else
					roles[r] = 1;
			}
		}

		var output = [];
		for (var key in roles)
			output.push({ id: key, count: roles[key] });

		$.callback(output);
	});

});