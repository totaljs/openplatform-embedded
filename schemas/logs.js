NEWSCHEMA('Logs', function(schema) {

	schema.setQuery(function($) {
		if ($.controller && FUNC.notadmin($))
			return;
		DBMS().list('logs').autofill($, 'id:uid,userid:string,rowid:string,type:string,ip:string,ua:string,username:string,data:string,message:string,dtcreated:date', null, 'dtcreated_desc', 100).callback($.callback);
	});

	schema.addWorkflow('clear', function($) {
		if ($.controller && FUNC.notadmin($))
			return;
		DBMS().remove('logs').callback($.done());
	});

});