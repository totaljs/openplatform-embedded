NEWSCHEMA('OAuth', function(schema) {

	schema.define('name', 'String(40)');
	schema.define('url', 'URL');
	schema.define('icon', 'String(30)');
	schema.define('version', 'String(20)');
	schema.define('allowreadprofile', Number);
	schema.define('allowreadapps', Number);
	schema.define('allowreadusers', Number);
	schema.define('allowreadmeta', Number);
	schema.define('blocked', Boolean);
	schema.define('rebuild', Boolean);

	schema.setQuery(function($) {

		if ($.controller && FUNC.notadmin($))
			return;

		$.callback(REPO.oauth);
	});

	schema.setInsert(function($, model) {

		if ($.controller && FUNC.notadmin($))
			return;

		model.id = UID();
		model.accesstoken = GUID(35);
		model.dtcreated = NOW;
		delete model.rebuild;
		REPO.oauth.unshift(model);
		DBMS().log($, model, model.name);
		FUNC.save('oauth');
		$.success($.id);
	});

	schema.setUpdate(function($, model) {

		if ($.controller && FUNC.notadmin($))
			return;

		model.dtupdated = NOW;

		if (model.rebuild)
			model.accesstoken = GUID(35);

		delete model.rebuild;
		var item = REPO.oauth.findItem('id', $.id);
		if (item) {
			for (var m in model)
				item[m] = model[m];
		}

		FUNC.save('oauth');
		DBMS().log($, model, model.name);
		$.success($.id);
	});

	schema.setRemove(function($) {

		if ($.controller && FUNC.notadmin($))
			return;

		var item = REPO.oauth.findItem('id', $.id);
		if (item) {
			var index = REPO.oauth.indexOf(item);
			REPO.oauth.splice(index, 1);
			DBMS().log($, null, item.name);
			FUNC.save('oauth');
			$.success($.id);
		} else
			$.invalid(404);

	});

});